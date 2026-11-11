-- Office command centre (November 2026).
--
-- Adds what the owner's single command centre needs and the audit found missing, on top of the
-- existing records, permissions and engines (nothing here replaces a working system):
--   1. customers, and each contract's customer
--   2. a job lifecycle stage with its own history (the installation-release `state` is untouched)
--   3. quotations, and tender enquiry status tracking
--   4. a materials requirement and ordering tracker
--   5. daily progress quantities and site photographs
--   6. supervisor message categories (question, decision, problem), urgency and recorded office decisions
--   7. global search across authorised records (security invoker: every table's RLS still applies)
--   8. debt ageing and cash-flow lines from the existing commercial account logic
--   9. an email notification outbox with recipients, dry-run by default, retry and a delivery log
--
-- Requires the hosted project's current objects (job messages, dayworks, commercial accounts, gang invoices,
-- the subcontractor portal and the public enquiry form). Office reviews (20261023090000) are used when present.
-- Existing records are never rewritten: a job without a confirmed stage reads its stage from its programme
-- dates until the office confirms one, and existing jobs are matched to customers by name until linked.
begin;
do $preflight$ begin
  if to_regclass('public.job_messages') is null
    or to_regprocedure('private.account_rows(uuid)') is null or to_regclass('public.gang_invoice_commercials') is null
    or to_regclass('public.subcontractor_portal_links') is null or to_regprocedure('private.has_money_access()') is null
    or to_regprocedure('private.can_supervise_contract(uuid)') is null or to_regclass('public.tender_enquiries') is null then
    raise exception 'Preflight failed: job messages, dayworks, commercial accounts, gang invoices, the subcontractor portal and the enquiry form must be applied first';
  end if;
  if to_regclass('public.customers') is not null or to_regclass('public.quotes') is not null
    or to_regclass('public.notification_outbox') is not null or to_regclass('public.material_requests') is not null then
    raise exception 'Preflight failed: office command centre objects already exist; review schema drift';
  end if;
end $preflight$;

-- ---------------------------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------------------------
-- Whether a named member (not necessarily the caller) may see a job. Mirrors private.can_access_contract
-- for office and site staff; used where there is no signed-in caller (notifications).
create function private.member_sees_contract(p_user uuid,p_contract uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.contracts c join public.organisation_members m on m.organisation_id=c.organisation_id and m.user_id=p_user and m.active
    where c.id=p_contract and (m.role='owner' or (m.role in ('contracts_manager','supervisor') and exists(
      select 1 from public.contract_assignments a where a.contract_id=c.id and a.user_id=p_user
        and a.valid_from<=current_date and (a.valid_until is null or a.valid_until>=current_date)))))
$$;
create function private.member_has_money(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.organisation_members where user_id=p_user and active
    and (role='owner' or (role='contracts_manager' and financial_access)))
$$;
-- An optional amount: absent or null is null, anything else is checked like a required one.
create function private.optional_decimal(p_data jsonb,p_key text,p_min numeric,p_max numeric) returns numeric
language plpgsql stable set search_path='' as $$
begin
  if p_data->p_key is null or p_data->p_key='null'::jsonb then return null; end if;
  return private.field_decimal(p_data,p_key,p_min,p_max);
end $$;
-- Text the office typed as "nothing to report" is not a problem to review.
create function private.meaningful_text(p_text text) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(length(regexp_replace(lower(coalesce(p_text,'')),'[^a-z0-9]+','','g'))>0,false)
    and regexp_replace(lower(trim(coalesce(p_text,''))),'[[:space:][:punct:]]+',' ','g') !~
      '^ *(none|no|nil|nothing|n a|na|ok|okay|all good|all ok|fine|good|none good day|none all good|nothing to report|no issues|no problems|none today|not applicable)? *$'
$$;

-- ---------------------------------------------------------------------------------------------
-- 1. Customers
-- ---------------------------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  name text not null check(length(trim(name)) between 2 and 160),
  kind text not null default 'client' check(kind in ('client','main_contractor','developer','consultant','other')),
  contact_name text check(contact_name is null or length(trim(contact_name)) between 1 and 160),
  email text check(email is null or (length(email)<=254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  phone text check(phone is null or length(trim(phone)) between 6 and 40),
  address text check(address is null or length(trim(address)) between 3 and 500),
  notes text check(notes is null or length(notes)<=2000),
  active boolean not null default true,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
  version integer not null default 1 check(version>0),
  unique(organisation_id,id)
);
create unique index customers_name on public.customers(organisation_id,lower(trim(name)));
alter table public.contracts add column customer_id uuid,
  add constraint contracts_customer_fk foreign key(organisation_id,customer_id) references public.customers(organisation_id,id);

-- ---------------------------------------------------------------------------------------------
-- 2. Job lifecycle. `state` remains the installation-release control and is not changed.
-- ---------------------------------------------------------------------------------------------
alter table public.contracts add column lifecycle_stage text
  check(lifecycle_stage in ('tender','won','mobilising','live','on_hold','practical_completion','defects','final_account','closed','lost'));
-- No job has a stored stage until the office confirms one (existing rows are not rewritten); until then
-- the programme dates decide it, for new and existing jobs alike.
-- The stage the office works to: the confirmed stage, or until one is confirmed, the one the programme dates indicate.
create function private.job_stage(p_stage text,p_start date,p_end date) returns text
language sql stable set search_path='' as $$
  select coalesce(p_stage,case when p_end is not null and p_end<current_date then 'practical_completion'
    when p_start is not null and p_start<=current_date then 'live' else 'won' end)
$$;
create table public.contract_stage_events (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  from_stage text not null, to_stage text not null, note text check(note is null or length(trim(note)) between 1 and 1000),
  actor_id uuid references auth.users(id), actor_name text not null, request_key uuid,
  created_at timestamptz not null default now(),
  unique(organisation_id,actor_id,request_key),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id)
);
create index contract_stage_events_contract on public.contract_stage_events(contract_id,created_at desc);

-- Each existing client name becomes a customer. Jobs are not rewritten: until the office links a job
-- explicitly, it is matched to its customer by name.
insert into public.customers(organisation_id,name)
select distinct on (organisation_id,lower(trim(client))) organisation_id,trim(client) from public.contracts
where length(trim(client))>=2 order by organisation_id,lower(trim(client)),created_at;

-- ---------------------------------------------------------------------------------------------
-- 3. Quotations and tender tracking
-- ---------------------------------------------------------------------------------------------
alter table public.tender_enquiries drop constraint if exists tender_enquiries_status_check;
alter table public.tender_enquiries add constraint tender_enquiries_status_check
  check(status in ('uploading','received','reviewing','pricing','declined','submitted','won','lost'));
create table public.tender_status_events (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  tender_id uuid not null references public.tender_enquiries(id), from_status text not null, to_status text not null,
  note text check(note is null or length(trim(note)) between 1 and 1000),
  actor_id uuid not null references auth.users(id), actor_name text not null, created_at timestamptz not null default now()
);
create index tender_status_events_tender on public.tender_status_events(tender_id,created_at desc);

create table public.quotes (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  number integer not null check(number>0), reference text not null check(reference ~ '^Q-[0-9]{5,}$'),
  customer_id uuid, tender_enquiry_id uuid references public.tender_enquiries(id), contract_id uuid,
  title text not null check(length(trim(title)) between 3 and 200),
  scope text check(scope is null or length(scope)<=4000),
  site_address text check(site_address is null or length(trim(site_address)) between 3 and 500),
  value_net numeric(16,2) not null check(value_net between 0 and 1000000000),
  estimated_cost numeric(16,2) check(estimated_cost is null or estimated_cost between 0 and 1000000000),
  status text not null default 'draft' check(status in ('draft','sent','accepted','declined','expired','withdrawn')),
  issued_on date, valid_until date, follow_up_on date, decided_on date,
  decision_note text check(decision_note is null or length(trim(decision_note)) between 1 and 1000),
  created_by uuid not null references auth.users(id), created_by_name text not null, created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
  version integer not null default 1 check(version>0), request_key uuid not null,
  unique(organisation_id,number), unique(organisation_id,created_by,request_key), unique(organisation_id,id),
  foreign key(organisation_id,customer_id) references public.customers(organisation_id,id),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
  check(status='draft' or issued_on is not null),
  check((status in ('accepted','declined','expired','withdrawn')) = (decided_on is not null)),
  check(valid_until is null or issued_on is null or valid_until>=issued_on)
);
create index quotes_status on public.quotes(organisation_id,status,follow_up_on);
create table public.quote_events (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, quote_id uuid not null,
  action text not null check(action in ('create','update','status')), from_status text, to_status text,
  note text check(note is null or length(note)<=1000), actor_id uuid not null references auth.users(id), actor_name text not null,
  created_at timestamptz not null default now(),
  foreign key(organisation_id,quote_id) references public.quotes(organisation_id,id)
);
create index quote_events_quote on public.quote_events(quote_id,created_at desc);

-- ---------------------------------------------------------------------------------------------
-- 4. Materials requirements and ordering. No prices: site staff on the job may see and raise them.
-- ---------------------------------------------------------------------------------------------
create table public.material_requests (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  work_area_id uuid, location_path text[] not null default '{}',
  item text not null check(length(trim(item)) between 1 and 160),
  quantity numeric(12,2) not null check(quantity>0 and quantity<=1000000),
  unit text not null check(unit in ('each','m2','m','lm','kg','litre','bag','box','tub','tonne','roll','pack','sheet','length','tube','tile','pallet')),
  needed_by date,
  status text not null default 'requested' check(status in ('requested','ordered','delivered','cancelled')),
  supplier text check(supplier is null or length(trim(supplier)) between 1 and 160),
  order_reference text check(order_reference is null or length(trim(order_reference)) between 1 and 120),
  ordered_on date, expected_on date, delivered_on date,
  note text check(note is null or length(trim(note)) between 1 and 1000),
  source text not null default 'site' check(source in ('site','office','handover')), handover_id uuid,
  requested_by uuid not null references auth.users(id), requested_by_name text not null, requested_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), updated_by_name text, updated_at timestamptz not null default now(),
  version integer not null default 1 check(version>0), request_key uuid not null,
  unique(organisation_id,requested_by,request_key), unique(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
  foreign key(organisation_id,contract_id,work_area_id) references public.work_areas(organisation_id,contract_id,id),
  check(status not in ('ordered','delivered') or ordered_on is not null),
  check(status<>'delivered' or delivered_on is not null)
);
create index material_requests_open on public.material_requests(organisation_id,status,needed_by);
create table public.material_request_events (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null, request_id uuid not null,
  action text not null, from_status text, to_status text not null, note text check(note is null or length(note)<=1000),
  actor_id uuid not null references auth.users(id), actor_name text not null, created_at timestamptz not null default now(),
  foreign key(organisation_id,contract_id,request_id) references public.material_requests(organisation_id,contract_id,id)
);

-- ---------------------------------------------------------------------------------------------
-- 5. Daily progress quantities and site photographs
-- ---------------------------------------------------------------------------------------------
create table public.site_progress_entries (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  work_date date not null, work_area_id uuid, work_package_id uuid, location_path text[] not null default '{}', team_id uuid,
  description text not null check(length(trim(description)) between 2 and 500),
  quantity numeric(12,2) check(quantity is null or (quantity>0 and quantity<=1000000)),
  unit text check(unit is null or unit in ('m2','lm','m','item','each','room','day')),
  recorded_by uuid not null references auth.users(id), recorded_by_name text not null, recorded_at timestamptz not null default now(),
  request_key uuid not null,
  voided_at timestamptz, voided_by uuid references auth.users(id), void_reason text check(void_reason is null or length(trim(void_reason)) between 3 and 500),
  unique(organisation_id,recorded_by,request_key), unique(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
  foreign key(organisation_id,contract_id,work_area_id) references public.work_areas(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id,work_package_id) references public.work_packages(organisation_id,contract_id,id),
  foreign key(organisation_id,team_id) references public.teams(organisation_id,id),
  check((quantity is null) = (unit is null)),
  check(num_nulls(voided_at,voided_by,void_reason) in (0,3))
);
create index site_progress_day on public.site_progress_entries(contract_id,work_date desc);
create table public.site_photos (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  work_date date not null, work_area_id uuid, location_path text[] not null default '{}',
  caption text check(caption is null or length(trim(caption)) between 1 and 300),
  actor_id uuid not null references auth.users(id), actor_name text not null,
  object_path text not null unique, sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  bytes integer not null check(bytes between 1 and 4194304), mime_type text not null check(mime_type in ('image/jpeg','image/png')),
  created_at timestamptz not null default now(), uploaded_at timestamptz, request_key uuid not null,
  unique(organisation_id,actor_id,request_key),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
  foreign key(organisation_id,contract_id,work_area_id) references public.work_areas(organisation_id,contract_id,id),
  check(object_path=organisation_id::text||'/site-photos/'||contract_id::text||'/'||id::text||case mime_type when 'image/png' then '.png' else '.jpg' end)
);
create index site_photos_day on public.site_photos(contract_id,work_date desc);

create function private.can_insert_site_photo_object(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.site_photos p where p.object_path=p_path and p.uploaded_at is null
    and p.actor_id=auth.uid() and private.can_supervise_contract(p.contract_id))
$$;
create function private.can_read_site_photo_object(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.site_photos p where p.object_path=p_path and p.organisation_id=private.current_org()
    and ((p.uploaded_at is not null and private.can_supervise_contract(p.contract_id))
      or (p.uploaded_at is null and p.actor_id=auth.uid() and private.can_supervise_contract(p.contract_id))))
$$;
create policy site_photo_insert on storage.objects for insert to authenticated with check(bucket_id='supervisor-evidence' and private.can_insert_site_photo_object(name));
create policy site_photo_read on storage.objects for select to authenticated using(bucket_id='supervisor-evidence' and private.can_read_site_photo_object(name));

-- ---------------------------------------------------------------------------------------------
-- 6. Message categories, urgency and the office's recorded decision on a conversation
-- ---------------------------------------------------------------------------------------------
alter table public.job_messages add column category text not null default 'message' check(category in ('message','question','decision','problem')),
  add column urgent boolean not null default false,
  add constraint job_messages_category_root check(thread_id=id or (category='message' and not urgent));
create table public.job_thread_outcomes (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null, thread_id uuid not null,
  outcome text not null check(outcome in ('answered','approved','rejected','resolved')),
  note text check(note is null or length(trim(note)) between 1 and 2000), message_id uuid not null,
  decided_by uuid not null references auth.users(id), decided_by_name text not null, decided_at timestamptz not null default now(),
  request_key uuid not null, unique(organisation_id,decided_by,request_key),
  foreign key(organisation_id,contract_id,thread_id) references public.job_messages(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id,message_id) references public.job_messages(organisation_id,contract_id,id)
);
create index job_thread_outcomes_thread on public.job_thread_outcomes(thread_id,decided_at desc);

create or replace function public.post_job_message(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $fn$
declare org uuid:=private.current_org(); c uuid; t uuid; thread public.job_messages; side text; site uuid; result uuid;
  kind text; about uuid; message text; asks boolean; cat text; hot boolean;
begin
  perform private.only_keys(p_data,array['contract_id','thread_id','about_type','about_id','body','needs_answer','category','urgent']);
  c:=private.field_uuid(p_data,'contract_id',true);
  t:=private.field_uuid(p_data,'thread_id');
  if t is null then
    if private.current_role() is distinct from 'supervisor' or not private.can_supervise_contract(c) then
      raise exception 'Only a supervisor on this site can start a conversation; the office sends an instruction' using errcode='42501'; end if;
    side:='site'; site:=auth.uid();
  else
    select * into thread from public.job_messages where id=t and organisation_id=org and contract_id=c and thread_id=id;
    if not found then raise exception 'This conversation is not available to you' using errcode='42501'; end if;
    if private.can_manage_contract(c) then side:='office';
    elsif thread.site_user_id=auth.uid() and private.current_role()='supervisor' and private.can_supervise_contract(c) then side:='site';
    else raise exception 'This conversation is not available to you' using errcode='42501'; end if;
    site:=thread.site_user_id;
  end if;
  result:=private.request_result(org,'post_job_message',p_request_key,p_data);
  if result is not null then return result; end if;
  message:=private.field_text(p_data,'body',2000,true);
  asks:=coalesce(private.field_boolean(p_data,'needs_answer'),false);
  cat:=coalesce(nullif(private.field_text(p_data,'category',20),''),'message');
  perform private.assert_choice(cat,'category',array['message','question','decision','problem']);
  hot:=coalesce(private.field_boolean(p_data,'urgent'),false);
  if t is not null and (cat<>'message' or hot) then
    raise exception 'Only a new conversation has a category or urgency' using errcode='22023'; end if;
  -- A question, decision request or problem always waits for the office.
  if cat<>'message' then asks:=true; end if;
  if t is null then
    kind:=coalesce(nullif(private.field_text(p_data,'about_type',20),''),'job');
    perform private.assert_choice(kind,'about_type',array['job','snag','hold','office_item','qa_result','handover','daywork']);
    about:=private.field_uuid(p_data,'about_id');
    if kind='job' then
      if about is not null then raise exception 'A message about the whole job names no record' using errcode='22023'; end if;
    elsif about is null or not (case kind
      when 'snag' then exists(select 1 from public.supervisor_issues where id=about and contract_id=c and organisation_id=org and snag_status is not null)
        and private.can_read_snag(about)
      when 'hold' then exists(select 1 from public.work_holds where id=about and contract_id=c and organisation_id=org) and private.can_read_work_hold(about)
      when 'office_item' then exists(select 1 from public.supervisor_office_items where id=about and contract_id=c and organisation_id=org
        and (recipient_id is null or recipient_id=auth.uid()))
      when 'qa_result' then exists(select 1 from public.supervisor_qa_submissions s join public.supervisor_office_items i on i.id=s.item_id
        where s.id=about and s.contract_id=c and s.organisation_id=org and (i.recipient_id is null or i.recipient_id=auth.uid()))
      when 'handover' then exists(select 1 from public.site_handovers where id=about and contract_id=c and organisation_id=org)
      when 'daywork' then exists(select 1 from public.dayworks where id=about and contract_id=c and organisation_id=org) and private.can_read_daywork(about)
      else false end) then
      raise exception 'Choose a record on this job that you can see' using errcode='22023'; end if;
    result:=gen_random_uuid();
    insert into public.job_messages(id,organisation_id,contract_id,thread_id,site_user_id,author_id,author_name,author_side,body,needs_answer,about_type,about_id,request_key,category,urgent)
      values(result,org,c,result,site,auth.uid(),(select display_name from public.organisation_members where organisation_id=org and user_id=auth.uid()),
        side,message,asks,kind,about,p_request_key,cat,hot);
  else
    insert into public.job_messages(organisation_id,contract_id,thread_id,site_user_id,author_id,author_name,author_side,body,needs_answer,request_key)
      values(org,c,t,site,auth.uid(),(select display_name from public.organisation_members where organisation_id=org and user_id=auth.uid()),
        side,message,asks,p_request_key) returning id into result;
  end if;
  perform private.record_request(org,'post_job_message',p_request_key,p_data,result);
  return result;
end $fn$;

-- The office records its answer or decision. The decision is also posted into the conversation as
-- an office message, so the supervisor sees it where they already read replies.
create function public.record_thread_outcome(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; t uuid; root public.job_messages; result uuid; msg uuid; outcome text; note text; label text; name text;
begin
  perform private.only_keys(p_data,array['contract_id','thread_id','outcome','note']);
  c:=private.field_uuid(p_data,'contract_id',true); t:=private.field_uuid(p_data,'thread_id',true);
  if not private.can_manage_contract(c) then raise exception 'Only the office for this job can record a decision' using errcode='42501'; end if;
  select * into root from public.job_messages where id=t and thread_id=id and contract_id=c and organisation_id=org;
  if not found then raise exception 'This conversation is not available to you' using errcode='42501'; end if;
  result:=private.request_result(org,'record_thread_outcome',p_request_key,p_data);
  if result is not null then return result; end if;
  outcome:=private.field_text(p_data,'outcome',20,true);
  perform private.assert_choice(outcome,'outcome',array['answered','approved','rejected','resolved']);
  if outcome in ('approved','rejected') and root.category<>'decision' then
    raise exception 'Approve or reject is for a decision request; answer or resolve this conversation instead' using errcode='22023'; end if;
  note:=nullif(private.field_text(p_data,'note',2000),'');
  if outcome in ('answered','rejected') and note is null then raise exception 'Give the answer or the reason' using errcode='22023'; end if;
  label:=case outcome when 'answered' then 'Answer' when 'approved' then 'Decision: approved' when 'rejected' then 'Decision: not approved' else 'Marked resolved' end;
  name:=private.member_name();
  insert into public.job_messages(organisation_id,contract_id,thread_id,site_user_id,author_id,author_name,author_side,body,needs_answer,request_key)
    values(org,c,t,root.site_user_id,auth.uid(),name,'office',label||coalesce(': '||note,'.'),false,gen_random_uuid()) returning id into msg;
  insert into public.job_thread_outcomes(organisation_id,contract_id,thread_id,outcome,note,message_id,decided_by,decided_by_name,request_key)
    values(org,c,t,outcome,note,msg,auth.uid(),name,p_request_key) returning id into result;
  perform private.record_request(org,'record_thread_outcome',p_request_key,p_data,result);
  return result;
end $$;

-- ---------------------------------------------------------------------------------------------
-- RLS, grants, append-only guards and audit for the new tables
-- ---------------------------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.contract_stage_events enable row level security;
alter table public.tender_status_events enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_events enable row level security;
alter table public.material_requests enable row level security;
alter table public.material_request_events enable row level security;
alter table public.site_progress_entries enable row level security;
alter table public.site_photos enable row level security;
alter table public.job_thread_outcomes enable row level security;

create policy customers_office_read on public.customers for select to authenticated using(organisation_id=private.current_org() and private.is_office());
create policy contract_stage_read on public.contract_stage_events for select to authenticated using(organisation_id=private.current_org() and private.can_supervise_contract(contract_id));
create policy tender_status_read on public.tender_status_events for select to authenticated using(organisation_id=private.current_org() and private.is_office());
create policy quotes_money_read on public.quotes for select to authenticated using(organisation_id=private.current_org() and private.has_money_access());
create policy quote_events_money_read on public.quote_events for select to authenticated using(organisation_id=private.current_org() and private.has_money_access());
create policy material_requests_read on public.material_requests for select to authenticated using(organisation_id=private.current_org() and private.can_supervise_contract(contract_id));
create policy material_events_read on public.material_request_events for select to authenticated using(organisation_id=private.current_org() and private.can_supervise_contract(contract_id));
create policy site_progress_read on public.site_progress_entries for select to authenticated using(organisation_id=private.current_org() and private.can_supervise_contract(contract_id));
create policy site_photos_read on public.site_photos for select to authenticated using(organisation_id=private.current_org() and private.can_supervise_contract(contract_id)
  and (uploaded_at is not null or actor_id=auth.uid()));
create policy thread_outcomes_read on public.job_thread_outcomes for select to authenticated using(organisation_id=private.current_org()
  and exists(select 1 from public.job_messages m where m.id=thread_id));

do $$ declare t text; begin
  foreach t in array array['customers','contract_stage_events','tender_status_events','quotes','quote_events','material_requests',
    'material_request_events','site_progress_entries','site_photos','job_thread_outcomes'] loop
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
  foreach t in array array['contract_stage_events','tender_status_events','quote_events','material_request_events','job_thread_outcomes'] loop
    execute format('create trigger command_centre_append_only before update or delete on public.%I for each row execute function private.guard_append_only()',t);
  end loop;
  foreach t in array array['customers','contract_stage_events','material_requests','site_progress_entries','site_photos','job_thread_outcomes'] loop
    execute format('create trigger command_centre_audit after insert or update on public.%I for each row execute function private.audit_mutation()',t);
  end loop;
  -- Quotation values are commercial, so their audit entries are marked commercial.
  execute 'create trigger command_centre_audit after insert or update on public.quotes for each row execute function private.audit_financial_mutation()';
end $$;

-- ---------------------------------------------------------------------------------------------
-- RPCs: customers, stages, quotes, tenders, materials, progress, photos
-- ---------------------------------------------------------------------------------------------
create function public.save_customer(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); cid uuid; v integer; result uuid; nm text; existing public.customers;
begin
  if not private.is_office() then raise exception 'Only the office can manage customers' using errcode='42501'; end if;
  perform private.only_keys(p_data,array['id','version','name','kind','contact_name','email','phone','address','notes','active']);
  result:=private.request_result(org,'save_customer',p_request_key,p_data); if result is not null then return result; end if;
  cid:=private.field_uuid(p_data,'id'); nm:=private.field_text(p_data,'name',160,true);
  if cid is null then
    insert into public.customers(organisation_id,name,kind,contact_name,email,phone,address,notes,created_by,updated_by)
    values(org,trim(nm),coalesce(nullif(private.field_text(p_data,'kind',20),''),'client'),nullif(private.field_text(p_data,'contact_name',160),''),
      nullif(lower(private.field_text(p_data,'email',254)),''),nullif(private.field_text(p_data,'phone',40),''),nullif(private.field_text(p_data,'address',500),''),
      nullif(private.field_text(p_data,'notes',2000),''),auth.uid(),auth.uid()) returning customers.id into result;
  else
    v:=private.field_integer(p_data,'version',1,1000000);
    select * into existing from public.customers where customers.id=cid and organisation_id=org for update;
    if not found then raise exception 'Customer not found' using errcode='42501'; end if;
    if existing.version<>v then raise exception 'This customer changed while you were editing. Refresh and try again.' using errcode='40001'; end if;
    update public.customers set name=trim(nm),kind=coalesce(nullif(private.field_text(p_data,'kind',20),''),kind),
      contact_name=nullif(private.field_text(p_data,'contact_name',160),''),email=nullif(lower(private.field_text(p_data,'email',254)),''),
      phone=nullif(private.field_text(p_data,'phone',40),''),address=nullif(private.field_text(p_data,'address',500),''),
      notes=nullif(private.field_text(p_data,'notes',2000),''),active=coalesce(private.field_boolean(p_data,'active'),active),
      updated_by=auth.uid(),updated_at=now(),version=version+1 where customers.id=existing.id returning customers.id into result;
  end if;
  perform private.record_request(org,'save_customer',p_request_key,p_data,result);
  return result;
end $$;

create function public.set_contract_customer(p_contract uuid,p_customer uuid) returns void
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org();
begin
  if not private.can_manage_contract(p_contract) then raise exception 'Only the office for this job can change its customer' using errcode='42501'; end if;
  if p_customer is not null and not exists(select 1 from public.customers where id=p_customer and organisation_id=org) then
    raise exception 'Choose a customer from your list' using errcode='22023'; end if;
  update public.contracts set customer_id=p_customer,
    client=coalesce((select name from public.customers where id=p_customer),client),version=version+1,updated_at=now()
  where id=p_contract and organisation_id=org;
end $$;

create function public.set_contract_stage(p_request_key uuid,p_contract uuid,p_stage text,p_note text) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c public.contracts; result uuid; payload jsonb; note text:=nullif(trim(coalesce(p_note,'')),'');
begin
  if not private.can_manage_contract(p_contract) then raise exception 'Only the office for this job can change its stage' using errcode='42501'; end if;
  payload:=jsonb_build_object('contract',p_contract,'stage',p_stage,'note',note);
  result:=private.request_result(org,'set_contract_stage',p_request_key,payload); if result is not null then return result; end if;
  perform private.assert_choice(p_stage,'stage',array['tender','won','mobilising','live','on_hold','practical_completion','defects','final_account','closed','lost']);
  select * into c from public.contracts where id=p_contract and organisation_id=org for update;
  if c.lifecycle_stage=p_stage then raise exception 'The job is already at that stage' using errcode='23514'; end if;
  if p_stage in ('on_hold','lost','closed') and note is null then raise exception 'Give a short reason for this stage' using errcode='22023'; end if;
  if note is not null and length(note)>1000 then raise exception 'Keep the note under 1,000 characters' using errcode='22023'; end if;
  insert into public.contract_stage_events(organisation_id,contract_id,from_stage,to_stage,note,actor_id,actor_name,request_key)
    values(org,p_contract,private.job_stage(c.lifecycle_stage,c.start_date,c.end_date),p_stage,note,auth.uid(),private.member_name(),p_request_key) returning id into result;
  update public.contracts set lifecycle_stage=p_stage,version=version+1,updated_at=now() where id=p_contract;
  perform private.record_request(org,'set_contract_stage',p_request_key,payload,result);
  return result;
end $$;

create function public.save_quote(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); result uuid; q public.quotes; n integer; cust uuid; tender uuid; v integer;
begin
  if not private.has_money_access() then raise exception 'Money access is required for quotations' using errcode='42501'; end if;
  perform private.only_keys(p_data,array['id','version','customer_id','tender_enquiry_id','title','scope','site_address','value_net','estimated_cost','valid_until','follow_up_on']);
  result:=private.request_result(org,'save_quote',p_request_key,p_data); if result is not null then return result; end if;
  cust:=private.field_uuid(p_data,'customer_id'); tender:=private.field_uuid(p_data,'tender_enquiry_id');
  if cust is not null and not exists(select 1 from public.customers where id=cust and organisation_id=org) then raise exception 'Choose a customer from your list' using errcode='22023'; end if;
  if tender is not null and not exists(select 1 from public.tender_enquiries where id=tender and status<>'uploading') then raise exception 'Choose a received tender enquiry' using errcode='22023'; end if;
  if private.field_uuid(p_data,'id') is null then
    perform pg_advisory_xact_lock(hashtextextended('quote-number:'||org::text,0));
    select coalesce(max(number),0)+1 into n from public.quotes where organisation_id=org;
    insert into public.quotes(organisation_id,number,reference,customer_id,tender_enquiry_id,title,scope,site_address,value_net,estimated_cost,valid_until,follow_up_on,
      created_by,created_by_name,updated_by,request_key)
    values(org,n,'Q-'||lpad(n::text,5,'0'),cust,tender,private.field_text(p_data,'title',200,true),nullif(private.field_text(p_data,'scope',4000),''),
      nullif(private.field_text(p_data,'site_address',500),''),private.field_decimal(p_data,'value_net',0,1000000000),
      private.optional_decimal(p_data,'estimated_cost',0,1000000000),private.field_date(p_data,'valid_until'),private.field_date(p_data,'follow_up_on'),
      auth.uid(),private.member_name(),auth.uid(),p_request_key) returning id into result;
    insert into public.quote_events(organisation_id,quote_id,action,to_status,actor_id,actor_name) values(org,result,'create','draft',auth.uid(),private.member_name());
  else
    v:=private.field_integer(p_data,'version',1,1000000);
    select * into q from public.quotes where id=private.field_uuid(p_data,'id') and organisation_id=org for update;
    if not found then raise exception 'Quotation not found' using errcode='42501'; end if;
    if q.version<>v then raise exception 'This quotation changed while you were editing. Refresh and try again.' using errcode='40001'; end if;
    if q.status not in ('draft','sent') then raise exception 'A decided quotation is kept as it was; start a new one for a revised price' using errcode='23514'; end if;
    update public.quotes set customer_id=cust,tender_enquiry_id=tender,title=private.field_text(p_data,'title',200,true),
      scope=nullif(private.field_text(p_data,'scope',4000),''),site_address=nullif(private.field_text(p_data,'site_address',500),''),
      value_net=private.field_decimal(p_data,'value_net',0,1000000000),estimated_cost=private.optional_decimal(p_data,'estimated_cost',0,1000000000),
      valid_until=private.field_date(p_data,'valid_until'),follow_up_on=private.field_date(p_data,'follow_up_on'),
      updated_by=auth.uid(),updated_at=now(),version=version+1 where id=q.id returning id into result;
    insert into public.quote_events(organisation_id,quote_id,action,from_status,to_status,actor_id,actor_name) values(org,result,'update',q.status,q.status,auth.uid(),private.member_name());
  end if;
  perform private.record_request(org,'save_quote',p_request_key,p_data,result);
  return result;
end $$;

create function public.set_quote_status(p_request_key uuid,p_quote uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); q public.quotes; target text; result uuid; on_date date; note text; job uuid;
begin
  if not private.has_money_access() then raise exception 'Money access is required for quotations' using errcode='42501'; end if;
  perform private.only_keys(p_data,array['status','on','note','contract_id','follow_up_on','valid_until']);
  result:=private.request_result(org,'set_quote_status',p_request_key,p_data||jsonb_build_object('quote',p_quote)); if result is not null then return result; end if;
  select * into q from public.quotes where id=p_quote and organisation_id=org for update;
  if not found then raise exception 'Quotation not found' using errcode='42501'; end if;
  if q.version<>p_version then raise exception 'This quotation changed while you were editing. Refresh and try again.' using errcode='40001'; end if;
  target:=private.field_text(p_data,'status',20,true);
  perform private.assert_choice(target,'status',array['sent','accepted','declined','expired','withdrawn']);
  on_date:=coalesce(private.field_date(p_data,'on'),private.site_today()); note:=nullif(private.field_text(p_data,'note',1000),'');
  job:=private.field_uuid(p_data,'contract_id');
  if target='sent' and q.status not in ('draft','sent') then raise exception 'Only a draft quotation can be sent' using errcode='23514'; end if;
  if target<>'sent' and q.status<>'sent' then raise exception 'Record the quotation as sent first' using errcode='23514'; end if;
  if target in ('declined','withdrawn') and note is null then raise exception 'Give a short reason' using errcode='22023'; end if;
  if job is not null and not exists(select 1 from public.contracts where id=job and organisation_id=org) then raise exception 'Choose a job from your list' using errcode='22023'; end if;
  update public.quotes set status=target,
    issued_on=case when target='sent' then on_date else issued_on end,
    follow_up_on=case when target='sent' then coalesce(private.field_date(p_data,'follow_up_on'),on_date+7) else follow_up_on end,
    valid_until=case when target='sent' then coalesce(private.field_date(p_data,'valid_until'),valid_until,on_date+30) else valid_until end,
    decided_on=case when target in ('accepted','declined','expired','withdrawn') then on_date else null end,
    decision_note=case when target='sent' then decision_note else note end,
    contract_id=coalesce(job,contract_id),updated_by=auth.uid(),updated_at=now(),version=version+1
  where id=q.id returning id into result;
  insert into public.quote_events(organisation_id,quote_id,action,from_status,to_status,note,actor_id,actor_name)
    values(org,q.id,'status',q.status,target,note,auth.uid(),private.member_name());
  if q.tender_enquiry_id is not null and target in ('sent','accepted','declined') then
    perform private.move_tender(q.tender_enquiry_id,case target when 'sent' then 'submitted' when 'accepted' then 'won' else 'lost' end,'From quotation '||q.reference);
  end if;
  perform private.record_request(org,'set_quote_status',p_request_key,p_data||jsonb_build_object('quote',p_quote),result);
  return result;
end $$;

create function private.move_tender(p_tender uuid,p_status text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare previous text;
begin
  select status into previous from public.tender_enquiries where id=p_tender for update;
  if previous is null or previous=p_status then return; end if;
  update public.tender_enquiries set status=p_status where id=p_tender;
  insert into public.tender_status_events(organisation_id,tender_id,from_status,to_status,note,actor_id,actor_name)
    values(private.current_org(),p_tender,previous,p_status,p_note,auth.uid(),private.member_name());
end $$;
create function public.set_tender_status(p_tender uuid,p_status text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare previous text;
begin
  if not private.is_office() then raise exception 'Only the office can update tender enquiries' using errcode='42501'; end if;
  perform private.assert_choice(p_status,'status',array['received','reviewing','pricing','declined','submitted','won','lost']);
  select status into previous from public.tender_enquiries where id=p_tender;
  if previous is null or previous='uploading' then raise exception 'Choose a received tender enquiry' using errcode='22023'; end if;
  if previous=p_status then raise exception 'The enquiry is already at that status' using errcode='23514'; end if;
  if p_status in ('declined','lost') and length(trim(coalesce(p_note,'')))<3 then raise exception 'Give a short reason' using errcode='22023'; end if;
  perform private.move_tender(p_tender,p_status,nullif(trim(coalesce(p_note,'')),''));
end $$;

create function public.request_material(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; area uuid; result uuid; path text[]:='{}'; src text; needed date;
begin
  perform private.only_keys(p_data,array['contract_id','work_area_id','item','quantity','unit','needed_by','note','source','handover_id']);
  c:=private.field_uuid(p_data,'contract_id',true);
  if not private.can_supervise_contract(c) then raise exception 'Only the office or a supervisor on this job can request materials' using errcode='42501'; end if;
  result:=private.request_result(org,'request_material',p_request_key,p_data); if result is not null then return result; end if;
  area:=private.field_uuid(p_data,'work_area_id');
  if area is not null then
    select coalesce(array_agg(a2.name order by ord),'{}') into path from public.work_areas a
      cross join lateral unnest(a.path_ids) with ordinality p(pid,ord) join public.work_areas a2 on a2.id=p.pid
      where a.id=area and a.contract_id=c and a.organisation_id=org;
    if path='{}' then raise exception 'Choose a location on this job' using errcode='22023'; end if;
  end if;
  src:=coalesce(nullif(private.field_text(p_data,'source',20),''),case when private.is_office() then 'office' else 'site' end);
  perform private.assert_choice(src,'source',array['site','office','handover']);
  needed:=private.field_date(p_data,'needed_by');
  insert into public.material_requests(organisation_id,contract_id,work_area_id,location_path,item,quantity,unit,needed_by,note,source,handover_id,
    requested_by,requested_by_name,request_key)
  values(org,c,area,path,private.field_text(p_data,'item',160,true),private.field_decimal(p_data,'quantity',0.01,1000000),
    private.field_text(p_data,'unit',12,true),needed,nullif(private.field_text(p_data,'note',1000),''),src,private.field_uuid(p_data,'handover_id'),
    auth.uid(),private.member_name(),p_request_key) returning id into result;
  insert into public.material_request_events(organisation_id,contract_id,request_id,action,to_status,actor_id,actor_name)
    values(org,c,result,'request','requested',auth.uid(),private.member_name());
  perform private.record_request(org,'request_material',p_request_key,p_data,result);
  return result;
end $$;

create function public.update_material_request(p_request uuid,p_version integer,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); m public.material_requests; target text; office boolean;
begin
  perform private.only_keys(p_data,array['status','supplier','order_reference','ordered_on','expected_on','delivered_on','note']);
  select * into m from public.material_requests where id=p_request and organisation_id=org for update;
  if not found or not private.can_supervise_contract(m.contract_id) then raise exception 'Material request not available' using errcode='42501'; end if;
  if m.version<>p_version then raise exception 'This request changed while you were editing. Refresh and try again.' using errcode='40001'; end if;
  office:=private.can_manage_contract(m.contract_id);
  target:=coalesce(nullif(private.field_text(p_data,'status',20),''),m.status);
  perform private.assert_choice(target,'status',array['requested','ordered','delivered','cancelled']);
  if not office and not (target='delivered' or (target='cancelled' and m.requested_by=auth.uid() and m.status='requested')) then
    raise exception 'The office orders materials; on site you can confirm a delivery or cancel your own request' using errcode='42501'; end if;
  if m.status in ('delivered','cancelled') and target<>m.status then raise exception 'This request is closed' using errcode='23514'; end if;
  if target='cancelled' and length(trim(coalesce(private.field_text(p_data,'note',1000),'')))<3 then raise exception 'Give a short reason' using errcode='22023'; end if;
  update public.material_requests set status=target,
    supplier=case when office then coalesce(nullif(private.field_text(p_data,'supplier',160),''),supplier) else supplier end,
    order_reference=case when office then coalesce(nullif(private.field_text(p_data,'order_reference',120),''),order_reference) else order_reference end,
    ordered_on=case when target in ('ordered','delivered') then coalesce(private.field_date(p_data,'ordered_on'),ordered_on,private.site_today()) else ordered_on end,
    expected_on=case when office then coalesce(private.field_date(p_data,'expected_on'),expected_on) else expected_on end,
    delivered_on=case when target='delivered' then coalesce(private.field_date(p_data,'delivered_on'),delivered_on,private.site_today()) else delivered_on end,
    note=coalesce(nullif(private.field_text(p_data,'note',1000),''),note),
    updated_by=auth.uid(),updated_by_name=private.member_name(),updated_at=now(),version=version+1
  where id=m.id;
  insert into public.material_request_events(organisation_id,contract_id,request_id,action,from_status,to_status,note,actor_id,actor_name)
    values(org,m.contract_id,m.id,'update',m.status,target,nullif(private.field_text(p_data,'note',1000),''),auth.uid(),private.member_name());
end $$;

create function public.record_site_progress(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; area uuid; pkg uuid; result uuid; path text[]:='{}'; d date; qty numeric; u text;
begin
  perform private.only_keys(p_data,array['contract_id','work_date','work_area_id','work_package_id','team_id','description','quantity','unit']);
  c:=private.field_uuid(p_data,'contract_id',true);
  if not private.can_supervise_contract(c) then raise exception 'Only the office or a supervisor on this job can record progress' using errcode='42501'; end if;
  result:=private.request_result(org,'record_site_progress',p_request_key,p_data); if result is not null then return result; end if;
  d:=coalesce(private.field_date(p_data,'work_date'),private.site_today());
  if d>private.site_today() or d<private.site_today()-7 then raise exception 'Record progress for today or the last seven days' using errcode='22023'; end if;
  area:=private.field_uuid(p_data,'work_area_id'); pkg:=private.field_uuid(p_data,'work_package_id');
  if area is not null then
    select coalesce(array_agg(a2.name order by ord),'{}') into path from public.work_areas a
      cross join lateral unnest(a.path_ids) with ordinality p(pid,ord) join public.work_areas a2 on a2.id=p.pid
      where a.id=area and a.contract_id=c and a.organisation_id=org;
    if path='{}' then raise exception 'Choose a location on this job' using errcode='22023'; end if;
  end if;
  qty:=private.optional_decimal(p_data,'quantity',0.01,1000000); u:=nullif(private.field_text(p_data,'unit',12),'');
  if pkg is not null then
    select unit into u from public.work_packages where id=pkg and contract_id=c and organisation_id=org;
    if not found then raise exception 'Choose a work package on this job' using errcode='22023'; end if;
    if qty is null then raise exception 'Give the quantity done against the package' using errcode='22023'; end if;
  end if;
  if (qty is null) <> (u is null) then raise exception 'Give both a quantity and its unit, or neither' using errcode='22023'; end if;
  insert into public.site_progress_entries(organisation_id,contract_id,work_date,work_area_id,work_package_id,location_path,team_id,description,quantity,unit,
    recorded_by,recorded_by_name,request_key)
  values(org,c,d,area,pkg,path,private.field_uuid(p_data,'team_id'),private.field_text(p_data,'description',500,true),qty,u,
    auth.uid(),private.member_name(),p_request_key) returning id into result;
  perform private.record_request(org,'record_site_progress',p_request_key,p_data,result);
  return result;
end $$;

create function public.void_site_progress(p_entry uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare e public.site_progress_entries;
begin
  select * into e from public.site_progress_entries where id=p_entry and organisation_id=private.current_org() for update;
  if not found or not (private.can_manage_contract(e.contract_id) or (e.recorded_by=auth.uid() and private.can_supervise_contract(e.contract_id))) then
    raise exception 'Only the person who recorded it or the office can correct this entry' using errcode='42501'; end if;
  if e.voided_at is not null then raise exception 'Already marked as entered in error' using errcode='23514'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Give a short reason' using errcode='22023'; end if;
  update public.site_progress_entries set voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason) where id=e.id;
end $$;
-- Progress entries are corrected only by voiding with a reason.
create function private.guard_progress_entry() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Progress entries are kept; mark one as entered in error instead' using errcode='42501'; end if;
  if (to_jsonb(new)-'voided_at'-'voided_by'-'void_reason') is distinct from (to_jsonb(old)-'voided_at'-'voided_by'-'void_reason') or old.voided_at is not null then
    raise exception 'Progress entries are kept; mark one as entered in error instead' using errcode='42501'; end if;
  return new;
end $$;
create trigger guard_progress_entry before update or delete on public.site_progress_entries for each row execute function private.guard_progress_entry();

create function public.reserve_site_photo(p_request_key uuid,p_contract uuid,p_meta jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); result uuid; payload jsonb; mime text; hash text; size integer; area uuid; path text[]:='{}'; d date;
begin
  perform private.only_keys(p_meta,array['mime_type','sha256','bytes','work_area_id','caption','work_date']);
  if not private.can_supervise_contract(p_contract) then raise exception 'Site photograph permission required' using errcode='42501'; end if;
  payload:=jsonb_build_object('contract',p_contract,'meta',p_meta);
  result:=private.request_result(org,'reserve_site_photo',p_request_key,payload); if result is not null then return result; end if;
  mime:=private.field_text(p_meta,'mime_type',30,true); hash:=private.field_text(p_meta,'sha256',64,true); size:=private.field_integer(p_meta,'bytes',1,4194304);
  if mime not in ('image/jpeg','image/png') or hash !~ '^[0-9a-f]{64}$' or size is null then raise exception 'Choose a JPEG or PNG up to 4 MB with its exact hash' using errcode='22023'; end if;
  d:=coalesce(private.field_date(p_meta,'work_date'),private.site_today());
  if d>private.site_today() or d<private.site_today()-7 then raise exception 'Add photographs for today or the last seven days' using errcode='22023'; end if;
  area:=private.field_uuid(p_meta,'work_area_id');
  if area is not null then
    select coalesce(array_agg(a2.name order by ord),'{}') into path from public.work_areas a
      cross join lateral unnest(a.path_ids) with ordinality p(pid,ord) join public.work_areas a2 on a2.id=p.pid
      where a.id=area and a.contract_id=p_contract and a.organisation_id=org;
    if path='{}' then raise exception 'Choose a location on this job' using errcode='22023'; end if;
  end if;
  result:=gen_random_uuid();
  insert into public.site_photos(id,organisation_id,contract_id,work_date,work_area_id,location_path,caption,actor_id,actor_name,object_path,sha256,bytes,mime_type,request_key)
  values(result,org,p_contract,d,area,path,nullif(private.field_text(p_meta,'caption',300),''),auth.uid(),private.member_name(),
    org::text||'/site-photos/'||p_contract::text||'/'||result::text||case mime when 'image/png' then '.png' else '.jpg' end,hash,size,mime,p_request_key);
  perform private.record_request(org,'reserve_site_photo',p_request_key,payload,result);
  return result;
end $$;
create function public.confirm_site_photo(p_photo uuid,p_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.site_photos;
begin
  select * into p from public.site_photos where id=p_photo for update;
  if not found or auth.uid() is null or p.actor_id is distinct from auth.uid()
    or p.organisation_id is distinct from private.current_org() or p.sha256 is distinct from p_sha256 then
    raise exception 'Photograph reservation unavailable' using errcode='42501'; end if;
  if p.uploaded_at is not null then return; end if;
  if not private.can_supervise_contract(p.contract_id) then raise exception 'Uploader no longer has permission for this job' using errcode='42501'; end if;
  if not exists(select 1 from storage.objects where bucket_id='supervisor-evidence' and name=p.object_path
    and metadata->>'size'=p.bytes::text and metadata->>'mimetype'=p.mime_type) then
    raise exception 'Stored photograph does not match the reservation' using errcode='23514'; end if;
  update public.site_photos set uploaded_at=now() where id=p.id;
end $$;
create function private.guard_site_photo() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or (to_jsonb(new)-'uploaded_at') is distinct from (to_jsonb(old)-'uploaded_at') or old.uploaded_at is not null then
    raise exception 'Site photographs are kept as taken' using errcode='42501'; end if;
  return new;
end $$;
create trigger guard_site_photo before update or delete on public.site_photos for each row execute function private.guard_site_photo();

-- ---------------------------------------------------------------------------------------------
-- 7. Global search. Security invoker: each table's own row-level security decides what is found.
-- ---------------------------------------------------------------------------------------------
create function public.office_search(p_query text,p_limit integer default 60)
returns table(kind text,id uuid,label text,detail text,contract_id uuid)
language plpgsql stable security invoker set search_path='' as $$
#variable_conflict use_column
declare q text:=trim(coalesce(p_query,'')); pattern text; n integer:=least(greatest(coalesce(p_limit,60),1),200);
begin
  if length(q)<2 then return; end if;
  pattern:='%'||replace(replace(replace(left(q,80),'\','\\'),'%','\%'),'_','\_')||'%';
  return query
  (select 'job'::text,c.id,c.reference||' · '||c.name,concat_ws(' · ',nullif(c.client,''),nullif(c.address,''),replace(private.job_stage(c.lifecycle_stage,c.start_date,c.end_date),'_',' ')),c.id from public.contracts c
    where c.reference ilike pattern or c.name ilike pattern or c.client ilike pattern or c.address ilike pattern limit n)
  union all (select 'customer',cu.id,cu.name,concat_ws(' · ',cu.kind,cu.contact_name,cu.email),null::uuid from public.customers cu
    where cu.name ilike pattern or cu.contact_name ilike pattern or cu.email ilike pattern limit n)
  union all (select 'gang',t.id,t.name,'Gang or team',null::uuid from public.teams t where t.name ilike pattern limit n)
  union all (select 'company',s.id,s.name,concat_ws(' · ','Subcontractor company',s.contact_name),null::uuid from public.subcontractor_companies s
    where s.name ilike pattern or s.contact_name ilike pattern limit n)
  union all (select 'person',o.id,o.display_name,'Operative',null::uuid from public.operatives o where o.display_name ilike pattern limit n)
  union all (select 'gang_invoice',g.id,g.reference,concat_ws(' · ','Gang invoice',g.status),g.contract_id from public.gang_invoices g where g.reference ilike pattern limit n)
  union all (select 'client_document',d.id,d.reference,d.title,d.contract_id from public.commercial_documents d where d.reference ilike pattern or d.title ilike pattern limit n)
  union all (select 'quote',qq.id,qq.reference||' · '||qq.title,concat_ws(' · ','Quotation',qq.status),qq.contract_id from public.quotes qq
    where qq.reference ilike pattern or qq.title ilike pattern limit n)
  union all (select 'tender',e.id,e.reference||' · '||coalesce(nullif(e.project,''),'Enquiry'),concat_ws(' · ',nullif(e.company,''),e.name,e.status),null::uuid
    from public.tender_enquiries e where e.status<>'uploading' and (e.reference ilike pattern or e.project ilike pattern or e.company ilike pattern or e.name ilike pattern) limit n)
  union all (select 'snag',i.id,i.check_label,concat_ws(' · ',coalesce(i.snag_status,i.state),left(i.description,120)),i.contract_id from public.supervisor_issues i
    where i.check_label ilike pattern or i.description ilike pattern limit n)
  union all (select 'hold',h.id,case h.hold_type when 'safety' then 'Safety stop' else 'Quality hold' end||' · '||h.category,concat_ws(' · ',h.status,left(h.reason,120)),h.contract_id
    from public.work_holds h where h.reason ilike pattern or h.category ilike pattern limit n)
  union all (select 'daywork',w.id,case w.kind when 'variation' then 'Variation ' else 'Daywork ' end||w.number,left(w.description,140),w.contract_id from public.dayworks w
    where w.description ilike pattern or w.number::text=q limit n)
  union all (select 'material',m.id,m.item,concat_ws(' · ','Materials',m.status,m.supplier,m.order_reference),m.contract_id from public.material_requests m
    where m.item ilike pattern or m.supplier ilike pattern or m.order_reference ilike pattern limit n)
  union all (select 'message',jm.thread_id,left(jm.body,120),concat_ws(' · ','Site conversation',jm.author_name),jm.contract_id from public.job_messages jm
    where jm.body ilike pattern limit n);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 8. Debt ageing and cash flow, from the existing account rows (one calculation everywhere)
-- ---------------------------------------------------------------------------------------------
create function public.debtor_ledger() returns table(contract_id uuid,application_id uuid,number integer,display_status text,final_on date,outstanding numeric,days_overdue integer)
language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
declare c record; r jsonb; today date:=private.site_today();
begin
  if not private.has_money_access() then raise exception 'Money access is required' using errcode='42501'; end if;
  for c in select k.id from public.contracts k where k.organisation_id=private.current_org() and private.can_view_financials(k.id) loop
    for r in select * from private.account_rows(c.id) loop
      if r->>'status' in ('submitted','certified') and coalesce((r->>'outstanding')::numeric,0)>0 then
        contract_id:=c.id; application_id:=(r->>'application_id')::uuid; number:=(r->>'number')::integer; display_status:=r->>'display_status';
        final_on:=(r->>'final_on_effective')::date; outstanding:=(r->>'outstanding')::numeric;
        days_overdue:=case when final_on is null then 0 else greatest(today-final_on,0) end;
        return next;
      end if;
    end loop;
  end loop;
end $$;

create function public.cash_flow_lines(p_weeks integer default 8)
returns table(direction text,expected_on date,amount numeric,certainty text,source text,reference text,contract_id uuid,record_id uuid)
language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
declare horizon date:=private.site_today()+7*least(greatest(coalesce(p_weeks,8),1),26); org uuid:=private.current_org();
begin
  if not private.has_money_access() then raise exception 'Money access is required' using errcode='42501'; end if;
  return query select 'in'::text,greatest(d.final_on,private.site_today()),d.outstanding,
      case when d.display_status='overdue' then 'overdue' when d.display_status in ('certified','part_paid') then 'certified' else 'applied' end,
      'application'::text,'Application '||d.number,d.contract_id,d.application_id
    from public.debtor_ledger() d where coalesce(d.final_on,private.site_today())<=horizon;
  return query select 'out'::text,coalesce(gc.agreed_payment_on,gc.payment_due_on),coalesce(gc.net_payable,gc.approved_amount),'approved'::text,
      'gang_invoice'::text,g.reference,g.contract_id,g.id
    from public.gang_invoices g join public.gang_invoice_commercials gc on gc.invoice_id=g.id
    where g.organisation_id=org and g.status='approved' and gc.paid_on is null and private.can_view_financials(g.contract_id)
      and coalesce(gc.agreed_payment_on,gc.payment_due_on)<=horizon;
  return query select 'out'::text,gc.payment_due_on,coalesce(gc.invoice_total,0),'claimed'::text,'gang_invoice'::text,g.reference,g.contract_id,g.id
    from public.gang_invoices g join public.gang_invoice_commercials gc on gc.invoice_id=g.id
    where g.organisation_id=org and g.status in ('awaiting_check','with_office','query_gang','returned') and coalesce(gc.invoice_total,0)>0
      and private.can_view_financials(g.contract_id) and gc.payment_due_on<=horizon;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 9. Email notifications: settings, verified recipients, outbox with dedupe, retry and a delivery log.
-- Dry-run by default. Nothing is sent until the owner has a verified recipient, a successful test
-- message through the configured sender, and switches delivery on.
-- ---------------------------------------------------------------------------------------------
create table public.notification_settings (
  organisation_id uuid primary key references public.organisations(id),
  live boolean not null default false, live_since timestamptz, live_by uuid references auth.users(id),
  urgent_enabled boolean not null default true, summary_enabled boolean not null default true,
  urgent_hourly_cap integer not null default 6 check(urgent_hourly_cap between 1 and 50),
  dispatcher_token_hash text check(dispatcher_token_hash is null or dispatcher_token_hash ~ '^[0-9a-f]{64}$'), dispatcher_token_set_at timestamptz,
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), version integer not null default 1 check(version>0)
);
create table public.notification_recipients (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  user_id uuid not null references auth.users(id), email text not null check(length(email)<=254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  urgent boolean not null default true, summary boolean not null default true, active boolean not null default true,
  confirmed_at timestamptz, confirmed_by uuid references auth.users(id), test_sent_at timestamptz,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organisation_id,user_id), unique(organisation_id,id)
);
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  recipient_id uuid not null, user_id uuid not null references auth.users(id), email text not null,
  kind text not null check(kind in ('urgent','summary','test')), topic text not null check(length(topic) between 1 and 60),
  dedupe_key text not null check(length(dedupe_key) between 3 and 200),
  subject text not null check(length(subject) between 1 and 200), payload jsonb not null, financial boolean not null default false,
  contract_id uuid,
  status text not null default 'pending' check(status in ('pending','sending','sent','failed','dry_run','suppressed')),
  attempts integer not null default 0 check(attempts between 0 and 10), next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz, sent_at timestamptz, provider_message_id text, last_error text check(last_error is null or length(last_error)<=1000),
  created_at timestamptz not null default now(),
  unique(organisation_id,dedupe_key),
  foreign key(organisation_id,recipient_id) references public.notification_recipients(organisation_id,id)
);
create index notification_outbox_due on public.notification_outbox(status,next_attempt_at);
create index notification_outbox_recent on public.notification_outbox(organisation_id,created_at desc);
create table public.notification_attempts (
  id bigint generated always as identity primary key, organisation_id uuid not null, outbox_id uuid not null references public.notification_outbox(id),
  attempted_at timestamptz not null default now(), result text not null check(result in ('sent','failed','dry_run','suppressed')),
  provider_message_id text, error text check(error is null or length(error)<=1000)
);
alter table public.notification_settings enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_attempts enable row level security;
create policy notification_settings_owner on public.notification_settings for select to authenticated using(organisation_id=private.current_org() and private.is_owner());
create policy notification_recipients_owner on public.notification_recipients for select to authenticated
  using(organisation_id=private.current_org() and (private.is_owner() or user_id=auth.uid()));
create policy notification_outbox_owner on public.notification_outbox for select to authenticated using(organisation_id=private.current_org() and private.is_owner());
create policy notification_attempts_owner on public.notification_attempts for select to authenticated using(organisation_id=private.current_org() and private.is_owner());
do $$ declare t text; begin
  foreach t in array array['notification_settings','notification_recipients','notification_outbox','notification_attempts'] loop
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
-- The attempt log is append-only.
create trigger notification_attempts_append_only before update or delete on public.notification_attempts for each row execute function private.guard_append_only();
insert into public.notification_settings(organisation_id) select id from public.organisations;

-- Queue one urgent email for every confirmed recipient who may see the job. Never fails the record it reports.
create function private.queue_urgent(p_org uuid,p_contract uuid,p_topic text,p_record uuid,p_subject text,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r public.notification_recipients; s public.notification_settings;
begin
  select * into s from public.notification_settings where organisation_id=p_org;
  if not found or not s.urgent_enabled then return; end if;
  for r in select * from public.notification_recipients x where x.organisation_id=p_org and x.active and x.urgent and x.confirmed_at is not null loop
    if private.member_sees_contract(r.user_id,p_contract) and exists(select 1 from public.organisation_members m where m.user_id=r.user_id
        and m.organisation_id=p_org and m.active and m.role in ('owner','contracts_manager')) then
      insert into public.notification_outbox(organisation_id,recipient_id,user_id,email,kind,topic,dedupe_key,subject,payload,contract_id)
        values(p_org,r.id,r.user_id,r.email,'urgent',p_topic,'urgent:'||p_topic||':'||p_record::text||':'||r.user_id::text,left(p_subject,200),p_payload,p_contract)
        on conflict (organisation_id,dedupe_key) do nothing;
    end if;
  end loop;
exception when others then
  raise warning 'TileSPEC could not queue an urgent notification: %',sqlerrm;
end $$;
create function private.job_label(p_contract uuid) returns text language sql stable security definer set search_path='' as $$
  select reference||' · '||name from public.contracts where id=p_contract
$$;
create function private.notify_safety_stop() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.hold_type='safety' and new.status='active' then
    perform private.queue_urgent(new.organisation_id,new.contract_id,'safety_stop',new.id,'Safety stop: '||private.job_label(new.contract_id),
      jsonb_build_object('headline','A safety stop has been raised','job',private.job_label(new.contract_id),'where',array_to_string(new.location_path,' › '),
        'detail',left(new.reason,600),'raised_by',new.raised_by_name,'path','/admin/holds/'||new.id::text));
  end if;
  return null;
end $$;
create trigger notify_safety_stop after insert on public.work_holds for each row execute function private.notify_safety_stop();
create function private.notify_critical_snag() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.severity='critical' and new.snag_status in ('open','assigned') and (tg_op='INSERT' or old.severity is distinct from 'critical' or old.snag_status not in ('open','assigned')) then
    perform private.queue_urgent(new.organisation_id,new.contract_id,'critical_defect',new.id,'Critical defect: '||private.job_label(new.contract_id),
      jsonb_build_object('headline','A critical defect needs a decision','job',private.job_label(new.contract_id),'where',array_to_string(coalesce(new.location_path,'{}'),' › '),
        'detail',left(new.check_label||'. '||new.description,600),'path','/admin/snags/'||new.id::text));
  end if;
  return null;
end $$;
create trigger notify_critical_snag after insert or update of severity,snag_status on public.supervisor_issues for each row execute function private.notify_critical_snag();
create function private.notify_urgent_message() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.thread_id=new.id and new.urgent then
    perform private.queue_urgent(new.organisation_id,new.contract_id,'urgent_'||new.category,new.id,
      case new.category when 'decision' then 'Decision needed: ' when 'problem' then 'Problem on site: ' else 'Urgent question: ' end||private.job_label(new.contract_id),
      jsonb_build_object('headline',new.author_name||case new.category when 'decision' then ' needs a decision' when 'problem' then ' reported a problem' else ' asked an urgent question' end,
        'job',private.job_label(new.contract_id),'detail',left(new.body,600),'path','/admin/inbox?thread='||new.id::text));
  end if;
  return null;
end $$;
create trigger notify_urgent_message after insert on public.job_messages for each row execute function private.notify_urgent_message();

-- The morning summary for one recipient. Money appears only for someone with money access.
create function private.morning_summary(p_org uuid,p_user uuid,p_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare money boolean:=private.member_has_money(p_user); yesterday date:=p_date-1; jobs uuid[]; result jsonb; money_section jsonb:=null; unreviewed bigint;
begin
  select coalesce(array_agg(c.id),'{}') into jobs from public.contracts c where c.organisation_id=p_org and private.member_sees_contract(p_user,c.id);
  result:=jsonb_build_object('date',p_date,'financial',money,
    'recipient',(select display_name from public.organisation_members where organisation_id=p_org and user_id=p_user),
    'stops',coalesce((select jsonb_agg(jsonb_build_object('type',h.hold_type,'job',private.job_label(h.contract_id),'where',array_to_string(h.location_path,' › '),
        'reason',left(h.reason,200),'status',h.status,'path','/admin/holds/'||h.id) order by h.hold_type desc,h.raised_at)
      from public.work_holds h where h.contract_id=any(jobs) and h.status in ('active','correction_submitted','awaiting_release')),'[]'::jsonb),
    'waiting',coalesce((select jsonb_agg(x order by x->>'since') from (select jsonb_build_object('job',private.job_label(r.contract_id),'category',r.category,'urgent',r.urgent,
        'text',left(r.body,160),'from',r.author_name,'since',l.created_at,'path','/admin/inbox?thread='||r.id) x
      from public.job_messages r join lateral (select * from public.job_messages z where z.thread_id=r.id order by z.created_at desc,(z.id=z.thread_id),z.id desc limit 1) l on true
      where r.thread_id=r.id and r.contract_id=any(jobs) and l.needs_answer and l.author_side='site') q),'[]'::jsonb),
    'unreviewed',null,
    'yesterday',coalesce((select jsonb_agg(jsonb_build_object('job',private.job_label(c.id),'path','/admin/contracts/'||c.id||'/activity?date='||yesterday,
        'handover',exists(select 1 from public.site_handovers h where h.contract_id=c.id and h.work_date=yesterday),
        'problems',(select string_agg(left(h.outstanding_problems,160),' / ') from public.site_handovers h where h.contract_id=c.id and h.work_date=yesterday and private.meaningful_text(h.outstanding_problems)),
        'teams',(select count(distinct a.team_id) from public.actual_allocations a where a.contract_id=c.id and a.work_date=yesterday and a.voided_at is null),
        'progress',(select count(*) from public.site_progress_entries p where p.contract_id=c.id and p.work_date=yesterday and p.voided_at is null),
        'photos',(select count(*) from public.site_photos p where p.contract_id=c.id and p.work_date=yesterday and p.uploaded_at is not null),
        'inspections',(select count(*) from public.location_inspections i where i.contract_id=c.id and (i.created_at at time zone 'Europe/London')::date=yesterday),
        'snags',(select count(*) from public.supervisor_issues i where i.contract_id=c.id and i.snag_status is not null and (i.created_at at time zone 'Europe/London')::date=yesterday))
        order by c.reference)
      from public.contracts c where c.id=any(jobs) and private.job_stage(c.lifecycle_stage,c.start_date,c.end_date) in ('mobilising','live','on_hold','practical_completion','defects')),'[]'::jsonb),
    'today',coalesce((select jsonb_agg(jsonb_build_object('job',private.job_label(c.id),'stage',private.job_stage(c.lifecycle_stage,c.start_date,c.end_date),
        'teams',(select count(distinct p.team_id) from public.planned_allocations p where p.contract_id=c.id and p.cancelled_at is null and p.superseded_by is null
          and p.planned_start<=p_date and p.planned_end>=p_date)) order by c.reference)
      from public.contracts c where c.id=any(jobs) and private.job_stage(c.lifecycle_stage,c.start_date,c.end_date) in ('mobilising','live')),'[]'::jsonb),
    'upcoming',coalesce((select jsonb_agg(u order by u->>'on') from (
        select jsonb_build_object('on',c.start_date,'what','Job starts','job',private.job_label(c.id)) u from public.contracts c
          where c.id=any(jobs) and c.start_date between p_date and p_date+14 and private.job_stage(c.lifecycle_stage,c.start_date,c.end_date) in ('won','mobilising')
        union all select jsonb_build_object('on',c.end_date,'what','Programme finish','job',private.job_label(c.id)) from public.contracts c
          where c.id=any(jobs) and c.end_date between p_date and p_date+14 and private.job_stage(c.lifecycle_stage,c.start_date,c.end_date) in ('mobilising','live')
        union all select jsonb_build_object('on',m.needed_by,'what','Materials needed: '||m.item,'job',private.job_label(m.contract_id)) from public.material_requests m
          where m.contract_id=any(jobs) and m.status='requested' and m.needed_by<=p_date+7
        union all select jsonb_build_object('on',i.expires_on,'what',s.name||' '||replace(i.insurance_type::text,'_',' ')||' insurance expires','job',null) from public.company_insurances i
          join public.subcontractor_companies s on s.id=i.company_id where s.organisation_id=p_org and i.voided_at is null and i.expires_on between p_date and p_date+30
        union all select jsonb_build_object('on',e.deadline,'what','Tender return: '||coalesce(nullif(e.project,''),e.reference),'job',null) from public.tender_enquiries e
          where e.deadline between p_date and p_date+7 and e.status in ('received','reviewing','pricing')) x),'[]'::jsonb),
    'gang_checks',(select count(*) from public.gang_invoices g where g.organisation_id=p_org and g.contract_id=any(jobs) and g.status='awaiting_check'));
  -- Handovers with something for the office that nobody has reviewed. Reviews arrive with their own migration.
  if to_regclass('public.office_reviews') is not null then
    execute 'select count(*) from public.site_handovers h where h.contract_id=any($1) and h.work_date>=$2-7
      and (private.meaningful_text(h.outstanding_problems) or private.meaningful_text(h.areas_awaiting_attention) or private.meaningful_text(h.office_notes))
      and not exists(select 1 from public.office_reviews v where v.handover_id=h.id)' into unreviewed using jobs,p_date;
    result:=result||jsonb_build_object('unreviewed',unreviewed);
  end if;
  if money then
    money_section:=jsonb_build_object(
      'gang_to_approve',(select count(*) from public.gang_invoices g where g.organisation_id=p_org and g.contract_id=any(jobs) and g.status='with_office'),
      'gang_due_7_days',(select coalesce(sum(coalesce(gc.net_payable,gc.approved_amount)),0) from public.gang_invoices g join public.gang_invoice_commercials gc on gc.invoice_id=g.id
        where g.organisation_id=p_org and g.contract_id=any(jobs) and g.status='approved' and gc.paid_on is null and coalesce(gc.agreed_payment_on,gc.payment_due_on)<=p_date+7),
      'quotes_follow_up',(select count(*) from public.quotes q where q.organisation_id=p_org and q.status='sent' and q.follow_up_on<=p_date),
      'overdue',(select coalesce(jsonb_agg(jsonb_build_object('job',private.job_label(c.id),'application',(r->>'number')::integer,'outstanding',(r->>'outstanding')::numeric,
          'days',p_date-(r->>'final_on_effective')::date)),'[]'::jsonb)
        from public.contracts c cross join lateral private.account_rows(c.id) r
        where c.id=any(jobs) and r->>'display_status'='overdue' and (r->>'outstanding')::numeric>0));
    result:=result||jsonb_build_object('money',money_section);
  end if;
  return result;
end $$;
create function public.preview_morning_summary(p_date date default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_office() then raise exception 'Only the office receives the morning summary' using errcode='42501'; end if;
  return private.morning_summary(private.current_org(),auth.uid(),coalesce(p_date,private.site_today()));
end $$;

-- Owner controls.
create function public.add_notification_recipient(p_user uuid,p_urgent boolean,p_summary boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); address text; result uuid;
begin
  if not private.is_owner() then raise exception 'Only the owner manages email notifications' using errcode='42501'; end if;
  if not exists(select 1 from public.organisation_members where organisation_id=org and user_id=p_user and active and role in ('owner','contracts_manager')) then
    raise exception 'Choose an active owner or contracts manager' using errcode='22023'; end if;
  -- Only the address the person signs in with: never a typed address, so nothing goes to an unverified mailbox.
  select lower(email) into address from auth.users where id=p_user;
  if address is null or address !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'This person has no sign-in email address' using errcode='22023'; end if;
  insert into public.notification_recipients(organisation_id,user_id,email,urgent,summary,created_by)
    values(org,p_user,address,coalesce(p_urgent,true),coalesce(p_summary,true),auth.uid())
    on conflict (organisation_id,user_id) do update set active=true,urgent=excluded.urgent,summary=excluded.summary,email=excluded.email,
      confirmed_at=case when notification_recipients.email=excluded.email then notification_recipients.confirmed_at end,updated_at=now()
    returning id into result;
  return result;
end $$;
create function public.update_notification_recipient(p_recipient uuid,p_urgent boolean,p_summary boolean,p_active boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_owner() then raise exception 'Only the owner manages email notifications' using errcode='42501'; end if;
  update public.notification_recipients set urgent=coalesce(p_urgent,urgent),summary=coalesce(p_summary,summary),active=coalesce(p_active,active),updated_at=now()
    where id=p_recipient and organisation_id=private.current_org();
  if not found then raise exception 'Recipient not found' using errcode='22023'; end if;
end $$;
-- A test message proves the sender configuration reaches this mailbox. It carries no business information.
create function public.queue_test_notification(p_recipient uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); r public.notification_recipients; result uuid;
begin
  if not private.is_owner() then raise exception 'Only the owner manages email notifications' using errcode='42501'; end if;
  select * into r from public.notification_recipients where id=p_recipient and organisation_id=org and active;
  if not found then raise exception 'Recipient not found' using errcode='22023'; end if;
  insert into public.notification_outbox(organisation_id,recipient_id,user_id,email,kind,topic,dedupe_key,subject,payload)
    values(org,r.id,r.user_id,r.email,'test','test','test:'||r.id::text||':'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSUS'),'TileSPEC test message',
      jsonb_build_object('headline','This is a TileSPEC test message','detail','If you received this, notifications can reach this mailbox. Confirm it in TileSPEC.'))
    returning id into result;
  return result;
end $$;
-- The owner confirms receipt of the test message for this mailbox.
create function public.confirm_notification_recipient(p_recipient uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_owner() then raise exception 'Only the owner manages email notifications' using errcode='42501'; end if;
  update public.notification_recipients set confirmed_at=now(),confirmed_by=auth.uid(),updated_at=now()
    where id=p_recipient and organisation_id=private.current_org() and active and test_sent_at is not null;
  if not found then raise exception 'Send a test message to this mailbox and check it arrived before confirming' using errcode='23514'; end if;
end $$;
create function public.set_notification_delivery(p_live boolean,p_urgent boolean,p_summary boolean) returns void
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org();
begin
  if not private.is_owner() then raise exception 'Only the owner manages email notifications' using errcode='42501'; end if;
  if coalesce(p_live,false) and not exists(select 1 from public.notification_recipients where organisation_id=org and active and confirmed_at is not null) then
    raise exception 'Confirm at least one recipient (send a test and check it arrived) before switching delivery on' using errcode='23514'; end if;
  if coalesce(p_live,false) and (select dispatcher_token_set_at from public.notification_settings where organisation_id=org) is null then
    raise exception 'Create the dispatcher key and add it to the hosting settings before switching delivery on' using errcode='23514'; end if;
  insert into public.notification_settings(organisation_id) values(org) on conflict do nothing;
  update public.notification_settings set live=coalesce(p_live,live),
    live_since=case when coalesce(p_live,live) and not live then now() when not coalesce(p_live,live) then null else live_since end,
    live_by=case when coalesce(p_live,live) and not live then auth.uid() else live_by end,
    urgent_enabled=coalesce(p_urgent,urgent_enabled),summary_enabled=coalesce(p_summary,summary_enabled),
    updated_by=auth.uid(),updated_at=now(),version=version+1 where organisation_id=org;
end $$;
-- A new dispatcher key; only its hash is stored. Shown once to the owner, who adds it to the hosting settings.
create function public.rotate_notification_dispatcher_key() returns text
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
  if not private.is_owner() then raise exception 'Only the owner manages email notifications' using errcode='42501'; end if;
  insert into public.notification_settings(organisation_id) values(org) on conflict do nothing;
  update public.notification_settings set dispatcher_token_hash=encode(sha256(convert_to(token,'UTF8')),'hex'),dispatcher_token_set_at=now(),
    updated_by=auth.uid(),updated_at=now(),version=version+1 where organisation_id=org;
  return token;
end $$;

-- Dispatcher functions: called by the scheduled server route with the dispatcher key and no user session.
create function private.dispatch_org(p_token text) returns uuid language plpgsql stable security definer set search_path='' as $$
declare org uuid;
begin
  if p_token is null or length(p_token)<32 or length(p_token)>200 then raise exception 'Dispatcher key required' using errcode='42501'; end if;
  select organisation_id into org from public.notification_settings where dispatcher_token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if org is null then raise exception 'Dispatcher key not recognised' using errcode='42501'; end if;
  return org;
end $$;
create function public.dispatch_queue_summaries(p_token text,p_date date) returns integer
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.dispatch_org(p_token); r public.notification_recipients; s public.notification_settings; d date:=coalesce(p_date,private.site_today()); n integer:=0;
begin
  select * into s from public.notification_settings where organisation_id=org;
  if not s.summary_enabled then return 0; end if;
  if d<>private.site_today() then raise exception 'Summaries are queued for today only' using errcode='22023'; end if;
  for r in select * from public.notification_recipients x where x.organisation_id=org and x.active and x.summary and x.confirmed_at is not null loop
    if exists(select 1 from public.organisation_members m where m.organisation_id=org and m.user_id=r.user_id and m.active and m.role in ('owner','contracts_manager')) then
      insert into public.notification_outbox(organisation_id,recipient_id,user_id,email,kind,topic,dedupe_key,subject,payload,financial)
        values(org,r.id,r.user_id,r.email,'summary','morning_summary','summary:'||d::text||':'||r.user_id::text,'TileSPEC morning summary · '||to_char(d,'Dy DD Mon'),
          private.morning_summary(org,r.user_id,d),private.member_has_money(r.user_id))
        on conflict (organisation_id,dedupe_key) do nothing;
      if found then n:=n+1; end if;
    end if;
  end loop;
  return n;
end $$;
-- Claims due messages. Each is re-checked: an inactive recipient, or a money summary for someone who no
-- longer has money access, is suppressed rather than sent. Urgent emails over the hourly cap are folded
-- into the next summary.
create function public.dispatch_claim(p_token text,p_limit integer default 20) returns table(id uuid,kind text,email text,subject text,payload jsonb,live boolean)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare org uuid:=private.dispatch_org(p_token); s public.notification_settings; o public.notification_outbox; ok boolean; recent integer;
begin
  select * into s from public.notification_settings where organisation_id=org;
  for o in select * from public.notification_outbox x where x.organisation_id=org
      and ((x.status='pending' and x.next_attempt_at<=now()) or (x.status='sending' and x.claimed_at<now()-interval '15 minutes'))
      order by x.kind='urgent' desc,x.created_at limit least(greatest(coalesce(p_limit,20),1),100) for update skip locked loop
    ok:=exists(select 1 from public.notification_recipients r join public.organisation_members m on m.user_id=r.user_id and m.organisation_id=r.organisation_id
      where r.id=o.recipient_id and r.active and m.active and m.role in ('owner','contracts_manager') and (o.kind='test' or r.confirmed_at is not null))
      and (not o.financial or private.member_has_money(o.user_id))
      and (o.contract_id is null or private.member_sees_contract(o.user_id,o.contract_id));
    if ok and o.kind='urgent' then
      select count(*) into recent from public.notification_outbox y where y.organisation_id=org and y.user_id=o.user_id and y.kind='urgent'
        and y.status in ('sent','sending') and y.claimed_at>now()-interval '1 hour' and y.id<>o.id;
      if recent>=s.urgent_hourly_cap then
        update public.notification_outbox set status='suppressed',last_error='Hourly urgent limit reached; included in the next summary' where notification_outbox.id=o.id;
        insert into public.notification_attempts(organisation_id,outbox_id,result,error) values(org,o.id,'suppressed','Hourly urgent limit reached');
        continue;
      end if;
    end if;
    if not ok then
      update public.notification_outbox set status='suppressed',last_error='Recipient no longer authorised for this message' where notification_outbox.id=o.id;
      insert into public.notification_attempts(organisation_id,outbox_id,result,error) values(org,o.id,'suppressed','Recipient no longer authorised');
      continue;
    end if;
    update public.notification_outbox set status='sending',claimed_at=now() where notification_outbox.id=o.id;
    id:=o.id; kind:=o.kind; email:=o.email; subject:=o.subject; payload:=o.payload; live:=(o.kind='test' or s.live);
    return next;
  end loop;
end $$;
create function public.dispatch_report(p_token text,p_outbox uuid,p_result text,p_provider_id text,p_error text) returns void
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.dispatch_org(p_token); o public.notification_outbox;
begin
  perform private.assert_choice(p_result,'result',array['sent','failed','dry_run']);
  select * into o from public.notification_outbox where id=p_outbox and organisation_id=org for update;
  if not found or o.status<>'sending' then raise exception 'This message is not being sent' using errcode='23514'; end if;
  insert into public.notification_attempts(organisation_id,outbox_id,result,provider_message_id,error)
    values(org,o.id,p_result,left(p_provider_id,200),left(p_error,1000));
  if p_result='sent' then
    update public.notification_outbox set status='sent',sent_at=now(),attempts=attempts+1,provider_message_id=left(p_provider_id,200),last_error=null where id=o.id;
    if o.kind='test' then update public.notification_recipients set test_sent_at=now() where id=o.recipient_id; end if;
  elsif p_result='dry_run' then
    update public.notification_outbox set status='dry_run',attempts=attempts+1,last_error=null where id=o.id;
  elsif o.attempts+1>=5 then
    update public.notification_outbox set status='failed',attempts=attempts+1,last_error=left(p_error,1000) where id=o.id;
  else
    update public.notification_outbox set status='pending',attempts=attempts+1,last_error=left(p_error,1000),
      next_attempt_at=now()+interval '5 minutes'*power(3,o.attempts) where id=o.id;
  end if;
end $$;
-- The owner can put a failed or suppressed message back in the queue.
create function public.retry_notification(p_outbox uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_owner() then raise exception 'Only the owner manages email notifications' using errcode='42501'; end if;
  update public.notification_outbox set status='pending',next_attempt_at=now(),last_error=null,attempts=0
    where id=p_outbox and organisation_id=private.current_org() and status in ('failed','suppressed');
  if not found then raise exception 'Only a failed or suppressed message can be retried' using errcode='23514'; end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------------------------
revoke all on function private.job_stage(text,date,date),private.member_sees_contract(uuid,uuid),private.member_has_money(uuid),private.meaningful_text(text),private.optional_decimal(jsonb,text,numeric,numeric),
  private.can_insert_site_photo_object(text),private.can_read_site_photo_object(text),private.move_tender(uuid,text,text),
  private.queue_urgent(uuid,uuid,text,uuid,text,jsonb),private.job_label(uuid),private.morning_summary(uuid,uuid,date),private.dispatch_org(text),
  private.guard_progress_entry(),private.guard_site_photo(),private.notify_safety_stop(),private.notify_critical_snag(),private.notify_urgent_message()
  from public,anon,authenticated;
-- Storage policies call the two object checks for the signed-in uploader; search reads the stage rule.
grant execute on function private.can_insert_site_photo_object(text),private.can_read_site_photo_object(text),private.job_stage(text,date,date) to authenticated;
revoke all on function public.record_thread_outcome(uuid,jsonb),public.save_customer(uuid,jsonb),public.set_contract_customer(uuid,uuid),
  public.set_contract_stage(uuid,uuid,text,text),public.save_quote(uuid,jsonb),public.set_quote_status(uuid,uuid,integer,jsonb),
  public.set_tender_status(uuid,text,text),public.request_material(uuid,jsonb),public.update_material_request(uuid,integer,jsonb),
  public.record_site_progress(uuid,jsonb),public.void_site_progress(uuid,text),public.reserve_site_photo(uuid,uuid,jsonb),public.confirm_site_photo(uuid,text),
  public.office_search(text,integer),public.debtor_ledger(),public.cash_flow_lines(integer),public.preview_morning_summary(date),
  public.add_notification_recipient(uuid,boolean,boolean),public.update_notification_recipient(uuid,boolean,boolean,boolean),
  public.queue_test_notification(uuid),public.confirm_notification_recipient(uuid),public.set_notification_delivery(boolean,boolean,boolean),
  public.rotate_notification_dispatcher_key(),public.retry_notification(uuid),
  public.dispatch_queue_summaries(text,date),public.dispatch_claim(text,integer),public.dispatch_report(text,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.record_thread_outcome(uuid,jsonb),public.save_customer(uuid,jsonb),public.set_contract_customer(uuid,uuid),
  public.set_contract_stage(uuid,uuid,text,text),public.save_quote(uuid,jsonb),public.set_quote_status(uuid,uuid,integer,jsonb),
  public.set_tender_status(uuid,text,text),public.request_material(uuid,jsonb),public.update_material_request(uuid,integer,jsonb),
  public.record_site_progress(uuid,jsonb),public.void_site_progress(uuid,text),public.reserve_site_photo(uuid,uuid,jsonb),public.confirm_site_photo(uuid,text),
  public.office_search(text,integer),public.debtor_ledger(),public.cash_flow_lines(integer),public.preview_morning_summary(date),
  public.add_notification_recipient(uuid,boolean,boolean),public.update_notification_recipient(uuid,boolean,boolean,boolean),
  public.queue_test_notification(uuid),public.confirm_notification_recipient(uuid),public.set_notification_delivery(boolean,boolean,boolean),
  public.rotate_notification_dispatcher_key(),public.retry_notification(uuid) to authenticated;
-- The scheduled dispatcher has no session; each of these requires the dispatcher key.
grant execute on function public.dispatch_queue_summaries(text,date),public.dispatch_claim(text,integer),public.dispatch_report(text,uuid,text,text,text) to anon;
commit;
