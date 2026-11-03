-- Job costs (C3): labour from the attendance supervisors already record, purchases and invoices,
-- and materials used on site.
--
-- Labour: the office (money access) records cost rates. An operative has an hourly (or day) rate;
-- a subcontractor company may have an agreed rate per operative; a gang may have an agreed day
-- rate. A rate can apply to every job or to one job, from a date. Labour cost on a job is worked
-- out from attendance (who was there, from when to when) and the rate in force that day. Nothing
-- new is asked of the supervisor.
--
-- Purchases and invoices: the office records each cost against the job (materials, subcontract,
-- plant or other), optionally against a location, a daywork or variation, and a document.
--
-- Materials used: the supervisor records items and quantities, never a price. The office matches
-- them against purchases and invoices. Matches are money records.
--
-- Rates, costs and matches are money records: only the owner and contracts managers with money
-- access read them. Every record is append-only; a mistake is voided with a reason.
-- Additive and transactional. Review before hosted use.
begin;
do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='dayworks' and column_name='kind')
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='operatives' and column_name='company_id')
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='teams' and column_name='company_id')
    or to_regclass('public.actual_allocation_operatives') is null or to_regprocedure('private.site_today()') is null
    or to_regprocedure('private.guard_append_only()') is null or to_regprocedure('private.audit_financial_mutation()') is null then
    raise exception 'Preflight failed: variations (20261104100000), attendance and subcontractor companies are required';
  end if;
  if to_regclass('public.labour_cost_rates') is not null or to_regclass('public.job_cost_entries') is not null
    or to_regclass('public.site_material_records') is not null or to_regclass('public.material_cost_matches') is not null
    or to_regprocedure('private.has_money_access()') is not null then
    raise exception 'Preflight failed: job cost objects already exist; review schema drift';
  end if;
end $$;

-- Money access for records that are not tied to one job (a rate for every job).
create function private.has_money_access() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.organisation_members where user_id=auth.uid() and active and organisation_id=private.current_org()
    and (role='owner' or (role='contracts_manager' and financial_access)))
$$;

create table public.labour_cost_rates (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  contract_id uuid, operative_id uuid, company_id uuid, team_id uuid,
  basis text not null check(basis in ('hour','day')),
  rate numeric(10,2) not null check(rate>0 and rate<=100000),
  effective_from date not null,
  note text check(note is null or length(trim(note)) between 1 and 500),
  created_by uuid not null references auth.users(id), created_by_name text not null, created_at timestamptz not null default now(),
  request_key uuid not null,
  voided_at timestamptz, voided_by uuid references auth.users(id), void_reason text check(void_reason is null or length(trim(void_reason)) between 3 and 1000),
  unique(organisation_id,created_by,request_key),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
  foreign key(organisation_id,operative_id) references public.operatives(organisation_id,id),
  foreign key(organisation_id,company_id) references public.subcontractor_companies(organisation_id,id),
  foreign key(organisation_id,team_id) references public.teams(organisation_id,id),
  -- Exactly one of: an operative, a subcontractor company (per operative), or a gang (per gang day).
  check(num_nonnulls(operative_id,company_id,team_id)=1),
  check(team_id is null or basis='day'),
  check(num_nulls(voided_at,voided_by,void_reason) in (0,3))
);
create table public.job_cost_entries (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  category text not null check(category in ('materials','subcontract','plant','other')),
  company_id uuid, supplier text check(supplier is null or length(trim(supplier)) between 1 and 160),
  reference text check(reference is null or length(trim(reference)) between 1 and 120),
  description text not null check(length(trim(description)) between 3 and 500),
  cost_date date not null,
  -- Net of VAT. A credit note is a negative amount.
  net_amount numeric(14,2) not null check(net_amount<>0 and net_amount between -10000000 and 10000000),
  work_area_id uuid, daywork_id uuid, document_id uuid references public.document_revisions(id),
  recorded_by uuid not null references auth.users(id), recorded_by_name text not null, recorded_at timestamptz not null default now(),
  request_key uuid not null,
  voided_at timestamptz, voided_by uuid references auth.users(id), void_reason text check(void_reason is null or length(trim(void_reason)) between 3 and 1000),
  unique(organisation_id,recorded_by,request_key), unique(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
  foreign key(organisation_id,company_id) references public.subcontractor_companies(organisation_id,id),
  foreign key(organisation_id,contract_id,work_area_id) references public.work_areas(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id,daywork_id) references public.dayworks(organisation_id,contract_id,id),
  check(company_id is not null or supplier is not null),
  check(num_nulls(voided_at,voided_by,void_reason) in (0,3))
);
-- What the supervisor used. Quantities only: never a price.
create table public.site_material_records (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  batch_id uuid not null, position integer not null check(position between 1 and 50),
  work_date date not null,
  item text not null check(length(trim(item)) between 1 and 120),
  quantity numeric(12,2) not null check(quantity>0 and quantity<=1000000),
  unit text not null check(unit in ('each','m2','m','kg','litre','bag','box','tub','tonne','roll','pack','sheet','length','tube','tile')),
  work_area_id uuid, location_path text[] not null default '{}',
  note text check(note is null or length(trim(note)) between 1 and 500),
  recorded_by uuid not null references auth.users(id), recorded_by_name text not null, recorded_at timestamptz not null default now(),
  voided_at timestamptz, voided_by uuid references auth.users(id), void_reason text check(void_reason is null or length(trim(void_reason)) between 3 and 1000),
  unique(batch_id,position), unique(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
  foreign key(organisation_id,contract_id,work_area_id) references public.work_areas(organisation_id,contract_id,id),
  check(num_nulls(voided_at,voided_by,void_reason) in (0,3))
);
-- The office's match of a material used against a purchase or invoice. Money access only.
create table public.material_cost_matches (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  material_record_id uuid not null, cost_entry_id uuid not null,
  matched_by uuid not null references auth.users(id), matched_by_name text not null, matched_at timestamptz not null default now(),
  request_key uuid not null,
  voided_at timestamptz, voided_by uuid references auth.users(id), void_reason text check(void_reason is null or length(trim(void_reason)) between 3 and 1000),
  unique(organisation_id,matched_by,request_key),
  foreign key(organisation_id,contract_id,material_record_id) references public.site_material_records(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id,cost_entry_id) references public.job_cost_entries(organisation_id,contract_id,id),
  check(num_nulls(voided_at,voided_by,void_reason) in (0,3))
);
create unique index material_cost_matches_current on public.material_cost_matches(material_record_id) where voided_at is null;
create index labour_cost_rates_subject on public.labour_cost_rates(organisation_id,operative_id,company_id,team_id,effective_from desc);
create index job_cost_entries_contract on public.job_cost_entries(contract_id,cost_date desc,id);
create index site_material_records_contract on public.site_material_records(contract_id,work_date desc,id);
create index material_cost_matches_contract on public.material_cost_matches(contract_id,cost_entry_id);

alter table public.labour_cost_rates enable row level security;
alter table public.job_cost_entries enable row level security;
alter table public.site_material_records enable row level security;
alter table public.material_cost_matches enable row level security;
create policy labour_cost_rates_read on public.labour_cost_rates for select to authenticated using(organisation_id=private.current_org()
  and case when contract_id is null then private.has_money_access() else private.can_view_financials(contract_id) end);
create policy job_cost_entries_read on public.job_cost_entries for select to authenticated using(
  organisation_id=private.current_org() and private.can_view_financials(contract_id));
create policy material_cost_matches_read on public.material_cost_matches for select to authenticated using(
  organisation_id=private.current_org() and private.can_view_financials(contract_id));
create policy site_material_records_read on public.site_material_records for select to authenticated using(
  organisation_id=private.current_org() and private.can_supervise_contract(contract_id));
do $$ declare t text; begin
  foreach t in array array['labour_cost_rates','job_cost_entries','site_material_records','material_cost_matches'] loop
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create trigger daily_append_only before update or delete on public.%I for each row execute function private.guard_append_only(''voided_at'',''voided_by'',''void_reason'')',t);
  end loop;
  foreach t in array array['labour_cost_rates','job_cost_entries','material_cost_matches'] loop
    execute format('create trigger financial_audit after insert or update on public.%I for each row execute function private.audit_financial_mutation()',t);
  end loop;
end $$;
create trigger daily_audit after insert or update on public.site_material_records for each row execute function private.audit_mutation();

-- A rate for an operative, a subcontractor company (per operative) or a gang (per gang day), for
-- every job or for one job, from a date. Money access only.
create function public.save_labour_rate(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); result uuid; subject text; subject_id uuid; c uuid; v_basis text;
begin
  perform private.only_keys(p_data,array['subject','subject_id','contract_id','basis','rate','effective_from','note']);
  c:=private.field_uuid(p_data,'contract_id');
  if (c is null and not private.has_money_access()) or (c is not null and not private.can_view_financials(c)) then
    raise exception 'Money access is required to set labour cost rates' using errcode='42501'; end if;
  result:=private.request_result(org,'save_labour_rate',p_request_key,p_data);
  if result is not null then return result; end if;
  subject:=private.field_text(p_data,'subject',10,true);
  perform private.assert_choice(subject,'subject',array['operative','company','team']);
  subject_id:=private.field_uuid(p_data,'subject_id',true);
  if not (case subject
    when 'operative' then exists(select 1 from public.operatives where id=subject_id and organisation_id=org)
    when 'company' then exists(select 1 from public.subcontractor_companies where id=subject_id and organisation_id=org)
    else exists(select 1 from public.teams where id=subject_id and organisation_id=org) end) then
    raise exception 'Choose an operative, company or gang in your organisation' using errcode='22023'; end if;
  v_basis:=private.field_text(p_data,'basis',4,true);
  perform private.assert_choice(v_basis,'basis',array['hour','day']);
  if subject='team' and v_basis<>'day' then raise exception 'A gang rate is a day rate' using errcode='22023'; end if;
  if private.field_date(p_data,'effective_from') is null then raise exception 'Say from which date the rate applies' using errcode='22023'; end if;
  insert into public.labour_cost_rates(organisation_id,contract_id,operative_id,company_id,team_id,basis,rate,effective_from,note,created_by,created_by_name,request_key)
    values(org,c,case when subject='operative' then subject_id end,case when subject='company' then subject_id end,case when subject='team' then subject_id end,
      v_basis,private.field_decimal(p_data,'rate',0.01,100000),private.field_date(p_data,'effective_from'),nullif(private.field_text(p_data,'note',500),''),
      auth.uid(),private.member_name(),p_request_key) returning id into result;
  perform private.record_request(org,'save_labour_rate',p_request_key,p_data,result);
  return result;
end $$;
create function public.void_labour_rate(p_rate uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.labour_cost_rates;
begin
  select * into r from public.labour_cost_rates where id=p_rate and organisation_id=private.current_org() for update;
  if not found or (r.contract_id is null and not private.has_money_access()) or (r.contract_id is not null and not private.can_view_financials(r.contract_id)) then
    raise exception 'Money access is required to void a labour cost rate' using errcode='42501'; end if;
  if r.voided_at is not null then return; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Say why the rate is voided' using errcode='22023'; end if;
  update public.labour_cost_rates set voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason) where id=r.id;
end $$;

-- A purchase or invoice against the job. Money access only.
create function public.record_job_cost(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; result uuid; v_category text; v_company uuid; v_area uuid; v_daywork uuid; v_doc uuid; v_date date;
begin
  perform private.only_keys(p_data,array['contract_id','category','company_id','supplier','reference','description','cost_date','net_amount','work_area_id','daywork_id','document_id']);
  c:=private.field_uuid(p_data,'contract_id',true);
  if not private.can_view_financials(c) then raise exception 'Money access is required to record a job cost' using errcode='42501'; end if;
  result:=private.request_result(org,'record_job_cost',p_request_key,p_data);
  if result is not null then return result; end if;
  v_category:=private.field_text(p_data,'category',12,true);
  perform private.assert_choice(v_category,'category',array['materials','subcontract','plant','other']);
  v_company:=private.field_uuid(p_data,'company_id'); v_area:=private.field_uuid(p_data,'work_area_id');
  v_daywork:=private.field_uuid(p_data,'daywork_id'); v_doc:=private.field_uuid(p_data,'document_id');
  if v_company is not null and not exists(select 1 from public.subcontractor_companies where id=v_company and organisation_id=org) then
    raise exception 'Choose a company in your organisation' using errcode='22023'; end if;
  if v_company is null and nullif(private.field_text(p_data,'supplier',160),'') is null then
    raise exception 'Say who the supplier or subcontractor is' using errcode='22023'; end if;
  if v_area is not null and not exists(select 1 from public.work_areas where id=v_area and contract_id=c) then
    raise exception 'Choose a location on this job' using errcode='22023'; end if;
  if v_daywork is not null and not exists(select 1 from public.dayworks where id=v_daywork and contract_id=c) then
    raise exception 'Choose a daywork or variation on this job' using errcode='22023'; end if;
  if v_doc is not null and not exists(select 1 from public.document_revisions r where r.id=v_doc and r.contract_id=c and r.uploaded_at is not null
    and private.can_read_document(r.contract_id,r.work_area_id,r.classification)) then
    raise exception 'Choose a document saved on this job' using errcode='22023'; end if;
  v_date:=coalesce(private.field_date(p_data,'cost_date'),private.site_today());
  if v_date>private.site_today()+31 then raise exception 'The cost date is too far in the future' using errcode='22023'; end if;
  insert into public.job_cost_entries(organisation_id,contract_id,category,company_id,supplier,reference,description,cost_date,net_amount,
    work_area_id,daywork_id,document_id,recorded_by,recorded_by_name,request_key)
  values(org,c,v_category,v_company,nullif(private.field_text(p_data,'supplier',160),''),nullif(private.field_text(p_data,'reference',120),''),
    private.field_text(p_data,'description',500,true),v_date,private.field_decimal(p_data,'net_amount',-10000000,10000000),
    v_area,v_daywork,v_doc,auth.uid(),private.member_name(),p_request_key) returning id into result;
  perform private.record_request(org,'record_job_cost',p_request_key,p_data,result);
  return result;
end $$;
create function public.void_job_cost(p_entry uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare e public.job_cost_entries;
begin
  select * into e from public.job_cost_entries where id=p_entry and organisation_id=private.current_org() for update;
  if not found or not private.can_view_financials(e.contract_id) then raise exception 'Money access is required to void a job cost' using errcode='42501'; end if;
  if e.voided_at is not null then return; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Say why the cost is voided' using errcode='22023'; end if;
  update public.job_cost_entries set voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason) where id=e.id;
  update public.material_cost_matches set voided_at=now(),voided_by=auth.uid(),void_reason='The cost it was matched to was voided'
    where cost_entry_id=e.id and voided_at is null;
end $$;

-- Materials used on site: items and quantities, from the supervisor or the office. Never a price.
create function public.record_materials_used(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; result uuid; v_date date; line jsonb; n integer:=0; area public.work_areas;
begin
  perform private.only_keys(p_data,array['contract_id','work_date','lines']);
  c:=private.field_uuid(p_data,'contract_id',true);
  if not private.can_supervise_contract(c) then raise exception 'Only a supervisor or the office on this job can record materials used' using errcode='42501'; end if;
  result:=private.request_result(org,'record_materials_used',p_request_key,p_data);
  if result is not null then return result; end if;
  v_date:=coalesce(private.field_date(p_data,'work_date'),private.site_today());
  if v_date>private.site_today() then raise exception 'The date cannot be in the future' using errcode='22023'; end if;
  if v_date<private.site_today()-31 then raise exception 'Ask the office to record materials used more than a month ago' using errcode='22023'; end if;
  if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines') not between 1 and 50 then
    raise exception 'Add from 1 to 50 materials' using errcode='22023'; end if;
  result:=gen_random_uuid();
  for line in select value from jsonb_array_elements(p_data->'lines') loop
    n:=n+1;
    perform private.only_keys(line,array['item','quantity','unit','work_area_id','note']);
    area:=null;
    if private.field_uuid(line,'work_area_id') is not null then
      select * into area from public.work_areas where id=private.field_uuid(line,'work_area_id') and contract_id=c and organisation_id=org;
      if not found then raise exception 'Choose a location on this job' using errcode='22023'; end if;
    end if;
    perform private.assert_choice(private.field_text(line,'unit',10,true),'unit',
      array['each','m2','m','kg','litre','bag','box','tub','tonne','roll','pack','sheet','length','tube','tile']);
    insert into public.site_material_records(organisation_id,contract_id,batch_id,position,work_date,item,quantity,unit,work_area_id,location_path,note,
      recorded_by,recorded_by_name)
    values(org,c,result,n,v_date,private.field_text(line,'item',120,true),private.field_decimal(line,'quantity',0.01,1000000),private.field_text(line,'unit',10,true),
      area.id,case when area.id is null then '{}'::text[] else array(select w.name from unnest(area.path_ids) with ordinality x(id,k)
        join public.work_areas w on w.id=x.id order by x.k) end,nullif(private.field_text(line,'note',500),''),auth.uid(),private.member_name());
  end loop;
  perform private.record_request(org,'record_materials_used',p_request_key,p_data,result);
  return result;
end $$;
-- The person who recorded it, or the office, can void a material line entered in error.
create function public.void_material_record(p_record uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare m public.site_material_records;
begin
  select * into m from public.site_material_records where id=p_record and organisation_id=private.current_org() for update;
  if not found or not (private.can_manage_contract(m.contract_id) or (m.recorded_by=auth.uid() and private.can_supervise_contract(m.contract_id))) then
    raise exception 'Only the person who recorded it or the office can void this' using errcode='42501'; end if;
  if m.voided_at is not null then return; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Say why it is voided' using errcode='22023'; end if;
  update public.site_material_records set voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason) where id=m.id;
  update public.material_cost_matches set voided_at=now(),voided_by=auth.uid(),void_reason='The material record was voided'
    where material_record_id=m.id and voided_at is null;
end $$;

-- Matching (money access): a material used belongs to one purchase or invoice; one invoice can cover many.
create function public.match_material_cost(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); m public.site_material_records; e public.job_cost_entries; result uuid;
begin
  perform private.only_keys(p_data,array['material_record_id','cost_entry_id']);
  select * into m from public.site_material_records where id=private.field_uuid(p_data,'material_record_id',true) and organisation_id=org for update;
  if not found or not private.can_view_financials(m.contract_id) then raise exception 'Money access is required to match materials to costs' using errcode='42501'; end if;
  result:=private.request_result(org,'match_material_cost',p_request_key,p_data);
  if result is not null then return result; end if;
  select * into e from public.job_cost_entries where id=private.field_uuid(p_data,'cost_entry_id',true) and contract_id=m.contract_id;
  if not found then raise exception 'Choose a cost recorded on this job' using errcode='22023'; end if;
  if m.voided_at is not null or e.voided_at is not null then raise exception 'A voided record cannot be matched' using errcode='22023'; end if;
  if exists(select 1 from public.material_cost_matches where material_record_id=m.id and voided_at is null) then
    raise exception 'This material is already matched. Unmatch it first.' using errcode='22023'; end if;
  insert into public.material_cost_matches(organisation_id,contract_id,material_record_id,cost_entry_id,matched_by,matched_by_name,request_key)
    values(org,m.contract_id,m.id,e.id,auth.uid(),private.member_name(),p_request_key) returning id into result;
  perform private.record_request(org,'match_material_cost',p_request_key,p_data,result);
  return result;
end $$;
create function public.unmatch_material_cost(p_match uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare x public.material_cost_matches;
begin
  select * into x from public.material_cost_matches where id=p_match and organisation_id=private.current_org() for update;
  if not found or not private.can_view_financials(x.contract_id) then raise exception 'Money access is required to unmatch' using errcode='42501'; end if;
  if x.voided_at is not null then return; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Say why it is unmatched' using errcode='22023'; end if;
  update public.material_cost_matches set voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason) where id=x.id;
end $$;

-- The rate in force for an operative, company or gang on a job on a date: a rate for that job
-- comes before a rate for every job; then the latest effective date; then the latest entered.
create function private.labour_rate(p_subject text,p_id uuid,p_contract uuid,p_date date) returns table(rate numeric,basis text)
language sql stable security definer set search_path='' as $$
  select r.rate,r.basis from public.labour_cost_rates r
  where r.voided_at is null and r.effective_from<=p_date and (r.contract_id=p_contract or r.contract_id is null)
    and case p_subject when 'operative' then r.operative_id=p_id when 'company' then r.company_id=p_id when 'team' then r.team_id=p_id else false end
  order by (r.contract_id is not null) desc,r.effective_from desc,r.created_at desc,r.id desc limit 1
$$;

-- Labour cost lines for one job, from attendance. A gang with a day rate is costed per gang day;
-- everyone else per person, at their own rate or else their company's. A day rate is shared
-- across the jobs worked that day in proportion to the hours on each. Attendance still open is
-- not costed until it ends. Hours without any rate are reported, not guessed.
create function private.labour_cost_lines(p_contract uuid)
returns table(work_date date,subject text,subject_id uuid,hours numeric,basis text,rate numeric,cost numeric,status text)
language sql stable security definer set search_path='' as $$
  with days as (
    select distinct a.work_date from public.actual_allocations a where a.contract_id=p_contract and a.voided_at is null
  ), presence as (
    select a.contract_id,a.work_date,a.team_id,o.operative_id,
      extract(epoch from coalesce(o.left_at,a.ended_at)-o.joined_at)/3600.0 as hours
    from public.actual_allocations a join days d on d.work_date=a.work_date
    join public.actual_allocation_operatives o on o.actual_allocation_id=a.id
    where a.voided_at is null and a.organisation_id=(select c.organisation_id from public.contracts c where c.id=p_contract)
  ), gang as (
    select p.work_date,p.team_id,r.rate,
      sum(p.hours) filter (where p.contract_id=p_contract) as job_hours,sum(p.hours) as all_hours,
      bool_or(p.contract_id=p_contract and p.hours is null) as has_open,bool_or(p.contract_id=p_contract) as on_job
    from presence p cross join lateral private.labour_rate('team',p.team_id,p_contract,p.work_date) r
    where p.team_id is not null group by p.work_date,p.team_id,r.rate
  ), person as (
    select p.work_date,p.operative_id,sum(p.hours) as job_hours,bool_or(p.hours is null) as has_open
    from presence p where p.contract_id=p_contract
      and not exists(select 1 from gang g where g.on_job and g.team_id=p.team_id and g.work_date=p.work_date)
    group by p.work_date,p.operative_id
  ), person_day as (
    select work_date,operative_id,sum(hours) as all_hours from presence group by work_date,operative_id
  ), person_rated as (
    select x.*,r.rate,r.basis from person x
    left join lateral (
      select y.rate,y.basis from (
        select 1 as priority,z.rate,z.basis from private.labour_rate('operative',x.operative_id,p_contract,x.work_date) z
        union all
        select 2,z.rate,z.basis from public.operatives op cross join lateral private.labour_rate('company',op.company_id,p_contract,x.work_date) z
          where op.id=x.operative_id and op.company_id is not null
      ) y order by y.priority limit 1
    ) r on true
  )
  select g.work_date,'team',g.team_id,round(coalesce(g.job_hours,0),2),'day',g.rate,
    case when g.has_open or coalesce(g.all_hours,0)=0 then null else round(g.rate*g.job_hours/g.all_hours,2) end,
    case when g.has_open then 'open' else 'costed' end
  from gang g where g.on_job
  union all
  select x.work_date,'operative',x.operative_id,round(coalesce(x.job_hours,0),2),x.basis,x.rate,
    case when x.has_open or x.rate is null then null when x.basis='hour' then round(x.rate*x.job_hours,2)
      when coalesce(d.all_hours,0)=0 then null else round(x.rate*x.job_hours/d.all_hours,2) end,
    case when x.has_open then 'open' when x.rate is null then 'no_rate' else 'costed' end
  from person_rated x join person_day d on d.work_date=x.work_date and d.operative_id=x.operative_id
$$;
create function public.contract_labour_costs(p_contract uuid)
returns table(work_date date,subject text,subject_id uuid,name text,hours numeric,basis text,rate numeric,cost numeric,status text)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.can_view_financials(p_contract) then raise exception 'Money access is required to see labour costs' using errcode='42501'; end if;
  return query select l.work_date,l.subject,l.subject_id,
    coalesce(case l.subject when 'team' then (select t.name from public.teams t where t.id=l.subject_id)
      else (select o.display_name from public.operatives o where o.id=l.subject_id) end,'Unknown'),
    l.hours,l.basis,l.rate,l.cost,l.status
  from private.labour_cost_lines(p_contract) l order by l.work_date desc,l.subject,2;
end $$;

revoke all on function private.has_money_access(),private.labour_rate(text,uuid,uuid,date),private.labour_cost_lines(uuid) from public,anon,authenticated;
grant execute on function private.has_money_access() to authenticated;
revoke all on function public.save_labour_rate(uuid,jsonb),public.void_labour_rate(uuid,text),public.record_job_cost(uuid,jsonb),public.void_job_cost(uuid,text),
  public.record_materials_used(uuid,jsonb),public.void_material_record(uuid,text),public.match_material_cost(uuid,jsonb),public.unmatch_material_cost(uuid,text),
  public.contract_labour_costs(uuid) from public,anon;
grant execute on function public.save_labour_rate(uuid,jsonb),public.void_labour_rate(uuid,text),public.record_job_cost(uuid,jsonb),public.void_job_cost(uuid,text),
  public.record_materials_used(uuid,jsonb),public.void_material_record(uuid,text),public.match_material_cost(uuid,jsonb),public.unmatch_material_cost(uuid,text),
  public.contract_labour_costs(uuid) to authenticated;
commit;
