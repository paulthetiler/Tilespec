-- Payment applications and payments received (C4). Money access only.
--
-- The office values the work completed to date (gross, cumulative) and adds each approved daywork
-- and variation it is claiming, plus any materials on site or other amounts. A draft can be
-- corrected; once submitted its figures are fixed. The client's certificate is recorded against it,
-- then each payment received. Retention is taken at the contract's retention percentage, fixed on
-- submission. Every figure the office sees is worked out by `payment_application_summaries`.
--
-- Additive and transactional. Review before hosted use.
begin;
do $$ begin
  if to_regclass('public.job_cost_entries') is null or to_regprocedure('private.has_money_access()') is null
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='dayworks' and column_name='kind') then
    raise exception 'Preflight failed: job costs (20261104110000) and variations are required';
  end if;
  if to_regclass('public.payment_applications') is not null or to_regclass('public.payment_application_lines') is not null
    or to_regclass('public.payment_receipts') is not null then
    raise exception 'Preflight failed: payment application objects already exist; review schema drift';
  end if;
end $$;

create table public.payment_applications (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  number integer not null check(number>0), period_end date not null,
  status text not null default 'draft' check(status in ('draft','submitted','certified','cancelled')),
  note text check(note is null or length(trim(note)) between 1 and 1000),
  lines_version integer not null default 1 check(lines_version>0),
  -- Fixed on submission.
  gross_applied numeric(16,2), retention_percent numeric(6,3) check(retention_percent is null or retention_percent between 0 and 100),
  submitted_at timestamptz, submitted_by uuid references auth.users(id), submitted_by_name text,
  -- The client's certificate.
  certified_gross numeric(16,2) check(certified_gross is null or certified_gross>=0), certified_on date,
  certificate_reference text check(certificate_reference is null or length(trim(certificate_reference)) between 1 and 120),
  certified_by uuid references auth.users(id), certified_by_name text, certified_at timestamptz,
  cancelled_at timestamptz, cancelled_by uuid references auth.users(id), cancel_reason text check(cancel_reason is null or length(trim(cancel_reason)) between 3 and 1000),
  created_by uuid not null references auth.users(id), created_by_name text not null, created_at timestamptz not null default now(),
  request_key uuid not null, version integer not null default 1 check(version>0), updated_at timestamptz not null default now(),
  unique(organisation_id,created_by,request_key), unique(contract_id,number), unique(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
  check((status in ('submitted','certified')) = (submitted_at is not null) or status='cancelled'),
  check((status='certified') = (certified_gross is not null)),
  check((status='cancelled') = (cancelled_at is not null))
);
create table public.payment_application_lines (
  id uuid primary key default gen_random_uuid(), application_id uuid not null, organisation_id uuid not null, contract_id uuid not null,
  lines_version integer not null check(lines_version>0), position integer not null check(position between 1 and 200),
  kind text not null check(kind in ('contract_works','extra_work','materials_on_site','other')),
  daywork_id uuid,
  description text not null check(length(trim(description)) between 1 and 300),
  amount numeric(16,2) not null check(amount between -100000000 and 100000000),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(application_id,lines_version,position),
  foreign key(organisation_id,contract_id,application_id) references public.payment_applications(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id,daywork_id) references public.dayworks(organisation_id,contract_id,id),
  check((kind='extra_work') = (daywork_id is not null)),
  check(kind='other' or amount>=0)
);
create unique index payment_application_lines_extra_once on public.payment_application_lines(application_id,lines_version,daywork_id) where daywork_id is not null;
create table public.payment_receipts (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null, application_id uuid not null,
  received_on date not null, amount numeric(16,2) not null check(amount>0 and amount<=100000000),
  reference text check(reference is null or length(trim(reference)) between 1 and 120),
  note text check(note is null or length(trim(note)) between 1 and 500),
  recorded_by uuid not null references auth.users(id), recorded_by_name text not null, recorded_at timestamptz not null default now(),
  request_key uuid not null,
  voided_at timestamptz, voided_by uuid references auth.users(id), void_reason text check(void_reason is null or length(trim(void_reason)) between 3 and 1000),
  unique(organisation_id,recorded_by,request_key),
  foreign key(organisation_id,contract_id,application_id) references public.payment_applications(organisation_id,contract_id,id),
  check(num_nulls(voided_at,voided_by,void_reason) in (0,3))
);
create index payment_applications_contract on public.payment_applications(contract_id,number);
create index payment_application_lines_current on public.payment_application_lines(application_id,lines_version,position);
create index payment_receipts_contract on public.payment_receipts(contract_id,received_on);

alter table public.payment_applications enable row level security;
alter table public.payment_application_lines enable row level security;
alter table public.payment_receipts enable row level security;
do $$ declare t text; begin
  foreach t in array array['payment_applications','payment_application_lines','payment_receipts'] loop
    execute format('create policy %I on public.%I for select to authenticated using(organisation_id=private.current_org() and private.can_view_financials(contract_id))',t||'_read',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create trigger financial_audit after insert or update on public.%I for each row execute function private.audit_financial_mutation()',t);
  end loop;
end $$;
create trigger daily_append_only before update or delete on public.payment_application_lines for each row execute function private.guard_append_only();
create trigger daily_append_only before update or delete on public.payment_receipts for each row execute function private.guard_append_only('voided_at','voided_by','void_reason');

-- An application's identity never changes; once submitted its figures are fixed; once certified or
-- cancelled it is final.
create function private.guard_payment_application() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Payment applications are permanent; cancel one with a reason' using errcode='42501'; end if;
  if (new.id,new.organisation_id,new.contract_id,new.number,new.created_by,new.created_by_name,new.created_at,new.request_key)
    is distinct from (old.id,old.organisation_id,old.contract_id,old.number,old.created_by,old.created_by_name,old.created_at,old.request_key) then
    raise exception 'A payment application cannot be rewritten' using errcode='42501'; end if;
  if old.status in ('certified','cancelled') then raise exception 'This payment application is final' using errcode='42501'; end if;
  if old.status='submitted' and (new.period_end,new.note,new.lines_version,new.gross_applied,new.retention_percent,new.submitted_at,new.submitted_by)
    is distinct from (old.period_end,old.note,old.lines_version,old.gross_applied,old.retention_percent,old.submitted_at,old.submitted_by) then
    raise exception 'A submitted payment application cannot be changed' using errcode='42501'; end if;
  return new;
end $$;
create trigger payment_application_guard before update or delete on public.payment_applications for each row execute function private.guard_payment_application();

-- Lines: the office's valuation. Extra work must be a daywork or variation on this job that the
-- office approved and whose charge was approved internally. Returns the gross total.
create function private.insert_payment_lines(p_application public.payment_applications,p_lines jsonb) returns numeric
language plpgsql security definer set search_path='' as $$
declare line jsonb; n integer:=0; v_kind text; v_daywork uuid; v_amount numeric; total numeric:=0;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 200 then
    raise exception 'Add the value of the work, from 1 to 200 lines' using errcode='22023'; end if;
  for line in select value from jsonb_array_elements(p_lines) loop
    n:=n+1;
    perform private.only_keys(line,array['kind','daywork_id','description','amount']);
    v_kind:=private.field_text(line,'kind',20,true);
    perform private.assert_choice(v_kind,'kind',array['contract_works','extra_work','materials_on_site','other']);
    v_daywork:=private.field_uuid(line,'daywork_id');
    if (v_kind='extra_work') <> (v_daywork is not null) then raise exception 'Only extra work names a daywork or variation' using errcode='22023'; end if;
    if v_daywork is not null and not exists(select 1 from public.dayworks d where d.id=v_daywork and d.contract_id=p_application.contract_id
      and d.office_status='approved' and d.commercial_status='commercially_approved') then
      raise exception 'Only a daywork or variation on this job approved by the office, with its charge approved, can be claimed' using errcode='22023'; end if;
    v_amount:=private.field_decimal(line,'amount',case when v_kind='other' then -100000000 else 0 end,100000000);
    insert into public.payment_application_lines(application_id,organisation_id,contract_id,lines_version,position,kind,daywork_id,description,amount,created_by)
      values(p_application.id,p_application.organisation_id,p_application.contract_id,p_application.lines_version,n,v_kind,v_daywork,
        private.field_text(line,'description',300,true),v_amount,auth.uid());
    total:=total+v_amount;
  end loop;
  if total<0 then raise exception 'The gross value cannot be less than nothing' using errcode='22023'; end if;
  return total;
end $$;
create function private.payment_application_for_update(p_application uuid,p_version integer) returns public.payment_applications
language plpgsql security definer set search_path='' as $$
declare a public.payment_applications;
begin
  select * into a from public.payment_applications where id=p_application and organisation_id=private.current_org() for update;
  if not found or not private.can_view_financials(a.contract_id) then raise exception 'Money access is required for payment applications' using errcode='42501'; end if;
  if p_version is not null and p_version is distinct from a.version then
    raise exception 'This application changed since you opened it. Refresh to see the latest.' using errcode='40001'; end if;
  return a;
end $$;

create function public.create_payment_application(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; a public.payment_applications; result uuid; v_end date;
begin
  perform private.only_keys(p_data,array['contract_id','period_end','note','lines']);
  c:=private.field_uuid(p_data,'contract_id',true);
  if not private.can_view_financials(c) then raise exception 'Money access is required for payment applications' using errcode='42501'; end if;
  result:=private.request_result(org,'create_payment_application',p_request_key,p_data);
  if result is not null then return result; end if;
  perform pg_advisory_xact_lock(hashtextextended('payment-application:'||c::text,0));
  if exists(select 1 from public.payment_applications where contract_id=c and status='draft') then
    raise exception 'This job already has a draft application. Finish or cancel it first.' using errcode='22023'; end if;
  v_end:=private.field_date(p_data,'period_end');
  if v_end is null then raise exception 'Enter the date the valuation runs to' using errcode='22023'; end if;
  if exists(select 1 from public.payment_applications where contract_id=c and status<>'cancelled' and period_end>=v_end) then
    raise exception 'Each application must run to a later date than the one before' using errcode='22023'; end if;
  insert into public.payment_applications(organisation_id,contract_id,number,period_end,note,created_by,created_by_name,request_key)
    values(org,c,(select coalesce(max(number),0)+1 from public.payment_applications where contract_id=c),v_end,
      nullif(private.field_text(p_data,'note',1000),''),auth.uid(),private.member_name(),p_request_key) returning * into a;
  perform private.insert_payment_lines(a,p_data->'lines');
  perform private.record_request(org,'create_payment_application',p_request_key,p_data,a.id);
  return a.id;
end $$;

-- A draft is corrected by saving a whole new set of lines; earlier sets are kept.
create function public.update_payment_application(p_application uuid,p_request_key uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.payment_applications:=private.payment_application_for_update(p_application,null); result uuid; payload jsonb; v_end date;
begin
  perform private.only_keys(p_data,array['period_end','note','lines']);
  payload:=jsonb_build_object('application',p_application,'version',p_version,'data',p_data);
  result:=private.request_result(a.organisation_id,'update_payment_application',p_request_key,payload);
  if result is not null then return result; end if;
  a:=private.payment_application_for_update(p_application,p_version);
  if a.status<>'draft' then raise exception 'Only a draft can be changed' using errcode='22023'; end if;
  v_end:=coalesce(private.field_date(p_data,'period_end'),a.period_end);
  if exists(select 1 from public.payment_applications where contract_id=a.contract_id and id<>a.id and status<>'cancelled' and period_end>=v_end) then
    raise exception 'Each application must run to a later date than the one before' using errcode='22023'; end if;
  update public.payment_applications set period_end=v_end,note=case when p_data?'note' then nullif(private.field_text(p_data,'note',1000),'') else note end,
    lines_version=lines_version+1,version=version+1,updated_at=now() where id=a.id returning * into a;
  perform private.insert_payment_lines(a,p_data->'lines');
  perform private.record_request(a.organisation_id,'update_payment_application',p_request_key,payload,a.id);
  return a.id;
end $$;

-- Submitting fixes the gross figure and the retention percentage from the contract's terms.
create function public.submit_payment_application(p_application uuid,p_request_key uuid,p_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.payment_applications:=private.payment_application_for_update(p_application,null); result uuid; payload jsonb;
begin
  payload:=jsonb_build_object('application',p_application,'version',p_version);
  result:=private.request_result(a.organisation_id,'submit_payment_application',p_request_key,payload);
  if result is not null then return result; end if;
  a:=private.payment_application_for_update(p_application,p_version);
  if a.status<>'draft' then raise exception 'Only a draft can be submitted' using errcode='22023'; end if;
  update public.payment_applications set status='submitted',submitted_at=now(),submitted_by=auth.uid(),submitted_by_name=private.member_name(),
    gross_applied=(select sum(amount) from public.payment_application_lines where application_id=a.id and lines_version=a.lines_version),
    retention_percent=coalesce((select retention_percent from public.contract_commercials where contract_id=a.contract_id),0),
    version=version+1,updated_at=now() where id=a.id;
  perform private.record_request(a.organisation_id,'submit_payment_application',p_request_key,payload,a.id);
  return a.id;
end $$;

-- The client's certificate: the gross value they certified, the date and their reference.
create function public.certify_payment_application(p_application uuid,p_request_key uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.payment_applications:=private.payment_application_for_update(p_application,null); result uuid; payload jsonb; v_on date;
begin
  perform private.only_keys(p_data,array['certified_gross','certified_on','certificate_reference']);
  payload:=jsonb_build_object('application',p_application,'version',p_version,'data',p_data);
  result:=private.request_result(a.organisation_id,'certify_payment_application',p_request_key,payload);
  if result is not null then return result; end if;
  a:=private.payment_application_for_update(p_application,p_version);
  if a.status<>'submitted' then raise exception 'Only a submitted application can be certified' using errcode='22023'; end if;
  v_on:=coalesce(private.field_date(p_data,'certified_on'),private.site_today());
  if v_on>private.site_today() then raise exception 'The certificate date cannot be in the future' using errcode='22023'; end if;
  update public.payment_applications set status='certified',certified_gross=private.field_decimal(p_data,'certified_gross',0,100000000),certified_on=v_on,
    certificate_reference=nullif(private.field_text(p_data,'certificate_reference',120),''),certified_by=auth.uid(),certified_by_name=private.member_name(),
    certified_at=now(),version=version+1,updated_at=now() where id=a.id;
  perform private.record_request(a.organisation_id,'certify_payment_application',p_request_key,payload,a.id);
  return a.id;
end $$;

create function public.cancel_payment_application(p_application uuid,p_version integer,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.payment_applications:=private.payment_application_for_update(p_application,p_version);
begin
  if a.status not in ('draft','submitted') then raise exception 'Only a draft or submitted application can be cancelled' using errcode='22023'; end if;
  if exists(select 1 from public.payment_receipts where application_id=a.id and voided_at is null) then
    raise exception 'Void the payments recorded against it first' using errcode='22023'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Say why it is cancelled' using errcode='22023'; end if;
  update public.payment_applications set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=trim(p_reason),version=version+1,updated_at=now()
    where id=a.id;
end $$;

create function public.record_payment_receipt(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.payment_applications; result uuid; v_on date;
begin
  perform private.only_keys(p_data,array['application_id','received_on','amount','reference','note']);
  a:=private.payment_application_for_update(private.field_uuid(p_data,'application_id',true),null);
  result:=private.request_result(a.organisation_id,'record_payment_receipt',p_request_key,p_data);
  if result is not null then return result; end if;
  if a.status not in ('submitted','certified') then raise exception 'Payments are recorded against a submitted or certified application' using errcode='22023'; end if;
  v_on:=coalesce(private.field_date(p_data,'received_on'),private.site_today());
  if v_on>private.site_today() then raise exception 'The date received cannot be in the future' using errcode='22023'; end if;
  insert into public.payment_receipts(organisation_id,contract_id,application_id,received_on,amount,reference,note,recorded_by,recorded_by_name,request_key)
    values(a.organisation_id,a.contract_id,a.id,v_on,private.field_decimal(p_data,'amount',0.01,100000000),nullif(private.field_text(p_data,'reference',120),''),
      nullif(private.field_text(p_data,'note',500),''),auth.uid(),private.member_name(),p_request_key) returning id into result;
  perform private.record_request(a.organisation_id,'record_payment_receipt',p_request_key,p_data,result);
  return result;
end $$;
create function public.void_payment_receipt(p_receipt uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.payment_receipts;
begin
  select * into r from public.payment_receipts where id=p_receipt and organisation_id=private.current_org() for update;
  if not found or not private.can_view_financials(r.contract_id) then raise exception 'Money access is required for payments' using errcode='42501'; end if;
  if r.voided_at is not null then return; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Say why the payment is voided' using errcode='22023'; end if;
  update public.payment_receipts set voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason) where id=r.id;
end $$;

-- Every figure for every application on a job, worked out from the saved records. Retention is at
-- the percentage fixed on submission (the contract's current percentage while still a draft).
-- "This period" is the net to date less the net to date of the previous live application.
create function private.payment_application_figures(p_contract uuid)
returns table(application_id uuid,number integer,period_end date,status text,gross numeric,retention_percent numeric,retention numeric,net numeric,
  net_this_period numeric,certified_gross numeric,certified_retention numeric,certified_net numeric,certified_this_period numeric,received numeric)
language sql stable security definer set search_path='' as $$
  with base as (
    select a.*,coalesce(a.gross_applied,(select coalesce(sum(l.amount),0) from public.payment_application_lines l where l.application_id=a.id and l.lines_version=a.lines_version)) as gross,
      coalesce(a.retention_percent,(select k.retention_percent from public.contract_commercials k where k.contract_id=a.contract_id),0) as pct
    from public.payment_applications a where a.contract_id=p_contract
  ), figures as (
    select b.*,round(b.gross*b.pct/100,2) as retention,b.gross-round(b.gross*b.pct/100,2) as net,
      case when b.certified_gross is null then null else round(b.certified_gross*b.pct/100,2) end as certified_retention,
      case when b.certified_gross is null then null else b.certified_gross-round(b.certified_gross*b.pct/100,2) end as certified_net
    from base b
  )
  select f.id,f.number,f.period_end,f.status,f.gross,f.pct,f.retention,f.net,
    case when f.status='cancelled' then null else f.net-coalesce((select p.net from figures p where p.status<>'cancelled' and p.number<f.number order by p.number desc limit 1),0) end,
    f.certified_gross,f.certified_retention,f.certified_net,
    case when f.certified_net is null then null else f.certified_net-coalesce((select p.certified_net from figures p where p.status='certified' and p.number<f.number order by p.number desc limit 1),0) end,
    (select coalesce(sum(r.amount),0) from public.payment_receipts r where r.application_id=f.id and r.voided_at is null)
  from figures f order by f.number
$$;
create function public.payment_application_summaries(p_contract uuid)
returns table(application_id uuid,number integer,period_end date,status text,gross numeric,retention_percent numeric,retention numeric,net numeric,
  net_this_period numeric,certified_gross numeric,certified_retention numeric,certified_net numeric,certified_this_period numeric,received numeric)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.can_view_financials(p_contract) then raise exception 'Money access is required for payment applications' using errcode='42501'; end if;
  return query select * from private.payment_application_figures(p_contract);
end $$;

revoke all on function private.guard_payment_application(),private.insert_payment_lines(public.payment_applications,jsonb),
  private.payment_application_for_update(uuid,integer),private.payment_application_figures(uuid) from public,anon,authenticated;
revoke all on function public.create_payment_application(uuid,jsonb),public.update_payment_application(uuid,uuid,integer,jsonb),
  public.submit_payment_application(uuid,uuid,integer),public.certify_payment_application(uuid,uuid,integer,jsonb),public.cancel_payment_application(uuid,integer,text),
  public.record_payment_receipt(uuid,jsonb),public.void_payment_receipt(uuid,text),public.payment_application_summaries(uuid) from public,anon;
grant execute on function public.create_payment_application(uuid,jsonb),public.update_payment_application(uuid,uuid,integer,jsonb),
  public.submit_payment_application(uuid,uuid,integer),public.certify_payment_application(uuid,uuid,integer,jsonb),public.cancel_payment_application(uuid,integer,text),
  public.record_payment_receipt(uuid,jsonb),public.void_payment_receipt(uuid,text),public.payment_application_summaries(uuid) to authenticated;
commit;
