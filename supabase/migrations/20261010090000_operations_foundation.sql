-- TileSPEC Phase 1. Apply only to a dedicated approved TileSPEC backend.
-- Membership is invitation/owner controlled, never inferred from email/sign-up.
-- One organisation per Auth account is an explicit Phase 1 limitation.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create type public.operations_role as enum ('owner', 'contracts_manager', 'supervisor', 'lead_installer', 'subcontract_installer');

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  target_margin numeric(6,3) not null default 30 check (target_margin >= 0 and target_margin < 100)
);
create table public.organisation_members (
  organisation_id uuid not null references public.organisations(id),
  user_id uuid not null references auth.users(id),
  display_name text not null check (length(trim(display_name)) between 1 and 200),
  role public.operations_role not null,
  financial_access boolean not null default false,
  active boolean not null default true,
  primary key (organisation_id,user_id),
  unique(user_id),
  check (not financial_access or role in ('owner','contracts_manager'))
);
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  reference text not null check (length(trim(reference)) between 1 and 80),
  name text not null check (length(trim(name)) between 1 and 160),
  client text not null default '', principal_contractor text not null default '', address text not null default '',
  site_contact text not null default '', scope text not null default '', exclusions text not null default '',
  tile_specification text not null default '', substrate_details text not null default '',
  installation_system text not null default '', movement_joints text not null default '',
  access_restrictions text not null default '', working_hours text not null default '',
  insurance_requirements text not null default '', defects_liability text not null default '',
  start_date date, end_date date,
  state text not null default 'draft' check (state = 'draft'),
  version integer not null default 1 check (version > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organisation_id,id), unique (organisation_id,reference),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create table public.contract_commercials (
  contract_id uuid primary key,
  organisation_id uuid not null,
  contract_value numeric(16,2) not null default 0 check (contract_value >= 0 and contract_value <= 1000000000),
  labour_budget numeric(16,2) not null default 0 check (labour_budget >= 0 and labour_budget <= 1000000000),
  materials_budget numeric(16,2) not null default 0 check (materials_budget >= 0 and materials_budget <= 1000000000),
  preliminaries_budget numeric(16,2) not null default 0 check (preliminaries_budget >= 0 and preliminaries_budget <= 1000000000),
  contingency numeric(16,2) not null default 0 check (contingency >= 0 and contingency <= 1000000000),
  target_margin numeric(6,3) not null default 30 check (target_margin >= 0 and target_margin < 100),
  payment_terms text not null default '',
  retention_percent numeric(6,3) not null default 0 check (retention_percent >= 0 and retention_percent <= 100),
  version integer not null default 1 check (version > 0), updated_at timestamptz not null default now(),
  foreign key (organisation_id,contract_id) references public.contracts(organisation_id,id)
);
create table public.contract_assignments (
  contract_id uuid not null, organisation_id uuid not null, user_id uuid not null,
  valid_from date not null default current_date, valid_until date,
  primary key (contract_id,user_id),
  foreign key (organisation_id,contract_id) references public.contracts(organisation_id,id),
  foreign key (organisation_id,user_id) references public.organisation_members(organisation_id,user_id),
  check (valid_until is null or valid_until >= valid_from)
);
create table public.work_areas (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 160), location text not null default '',
  substrate_notes text not null default '', system_notes text not null default '',
  specification_revision text not null default 'unapproved' check (specification_revision = 'unapproved'),
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  unique (organisation_id,contract_id,id),
  foreign key (organisation_id,contract_id) references public.contracts(organisation_id,id)
);
create table public.work_packages (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null, work_area_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 160),
  quantity numeric(14,3) not null check (quantity > 0 and quantity <= 1000000), unit text not null check (unit in ('m2','lm','item')),
  created_at timestamptz not null default now(), unique (organisation_id,contract_id,id),
  foreign key (organisation_id,contract_id,work_area_id) references public.work_areas(organisation_id,contract_id,id)
);
create table public.package_assignments (
  organisation_id uuid not null, contract_id uuid not null, work_package_id uuid not null, user_id uuid not null,
  primary key (work_package_id,user_id),
  foreign key (organisation_id,contract_id,work_package_id) references public.work_packages(organisation_id,contract_id,id),
  foreign key (organisation_id,user_id) references public.organisation_members(organisation_id,user_id)
);
create table public.document_revisions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null, work_area_id uuid,
  document_reference text not null check (length(trim(document_reference)) between 1 and 100),
  revision integer not null check (revision > 0), title text not null check (length(trim(title)) between 1 and 200),
  classification text not null check (classification in ('operational','commercial')),
  object_path text not null unique, sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  bytes bigint not null check (bytes > 0 and bytes <= 4194304),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), uploaded_at timestamptz,
  unique (contract_id,document_reference,revision),
  foreign key (organisation_id,contract_id) references public.contracts(organisation_id,id),
  foreign key (organisation_id,contract_id,work_area_id) references public.work_areas(organisation_id,contract_id,id),
  check (object_path = organisation_id::text || '/' || contract_id::text || '/' || classification || '/' ||
    coalesce(work_area_id::text,'contract') || '/' || id::text ||
    case mime_type when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end)
);
create table public.audit_events (
  id bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations(id), contract_id uuid,
  actor_id uuid references auth.users(id), action text not null, entity_type text not null, entity_id text not null,
  commercial boolean not null default false, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  foreign key (organisation_id,contract_id) references public.contracts(organisation_id,id)
);
create table private.idempotency_keys (
  organisation_id uuid not null references public.organisations(id), actor_id uuid not null references auth.users(id),
  operation text not null, request_key uuid not null, payload_digest text not null, result_id uuid not null,
  created_at timestamptz not null default now(), primary key (organisation_id,actor_id,operation,request_key)
);

create index contract_assignments_user on public.contract_assignments(user_id,contract_id);
create index package_assignments_user on public.package_assignments(user_id,contract_id,work_package_id);
create index work_areas_contract on public.work_areas(contract_id);
create index work_packages_area on public.work_packages(work_area_id);
create index document_revisions_contract on public.document_revisions(contract_id,created_at desc);
create index audit_events_contract on public.audit_events(organisation_id,contract_id,created_at desc);

-- Helpers run against trusted membership tables; client claims contain no authority.
create function private.current_org() returns uuid language sql stable security definer set search_path = '' as $$
  select organisation_id from public.organisation_members where user_id = auth.uid() and active
$$;
create function private.current_role() returns public.operations_role language sql stable security definer set search_path = '' as $$
  select role from public.organisation_members where user_id = auth.uid() and active
$$;
create function private.is_owner() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_role() = 'owner',false)
$$;
create function private.can_manage_contract(p_contract uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.contracts c where c.id = p_contract and c.organisation_id = private.current_org()
    and (private.is_owner() or (private.current_role() = 'contracts_manager' and exists (
      select 1 from public.contract_assignments a where a.contract_id = c.id and a.user_id = auth.uid()
        and a.valid_from <= current_date and (a.valid_until is null or a.valid_until >= current_date)))))
$$;
create function private.can_allocate_contract_user(p_contract uuid,p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_manage_contract(p_contract) and (private.is_owner() or exists (
    select 1 from public.organisation_members m where m.organisation_id=private.current_org() and m.user_id=p_user and m.role='supervisor'))
$$;
create function private.can_access_contract(p_contract uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.contracts c where c.id = p_contract and c.organisation_id = private.current_org() and (
    private.is_owner() or (private.current_role() in ('contracts_manager','supervisor') and exists (
      select 1 from public.contract_assignments a where a.contract_id = c.id and a.user_id = auth.uid()
        and a.valid_from <= current_date and (a.valid_until is null or a.valid_until >= current_date)))
    or (private.current_role() in ('lead_installer','subcontract_installer') and exists (
      select 1 from public.package_assignments a where a.contract_id = c.id and a.user_id = auth.uid()))))
$$;
create function private.can_view_financials(p_contract uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_manage_contract(p_contract) and (private.is_owner() or exists (
    select 1 from public.organisation_members where user_id = auth.uid() and active and role = 'contracts_manager' and financial_access))
$$;
create function private.can_access_package(p_package uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.work_packages p where p.id = p_package and p.organisation_id = private.current_org()
    and ((private.current_role() in ('owner','contracts_manager','supervisor') and private.can_access_contract(p.contract_id))
      or (private.current_role() in ('lead_installer','subcontract_installer') and exists (
        select 1 from public.package_assignments a where a.work_package_id = p.id and a.user_id = auth.uid()))))
$$;
create function private.can_access_area(p_area uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.work_areas a where a.id = p_area and a.organisation_id = private.current_org()
    and ((private.current_role() in ('owner','contracts_manager','supervisor') and private.can_access_contract(a.contract_id))
      or (private.current_role() in ('lead_installer','subcontract_installer') and exists (
        select 1 from public.work_packages p join public.package_assignments pa on pa.work_package_id = p.id
          where p.work_area_id = a.id and pa.user_id = auth.uid()))))
$$;
create function private.can_upload_document(p_contract uuid,p_area uuid,p_classification text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_access_contract(p_contract) and p_classification in ('operational','commercial') and
    (p_area is null or exists (select 1 from public.work_areas where id = p_area and contract_id = p_contract and private.can_access_area(id))) and
    (case when p_classification = 'commercial' then private.can_view_financials(p_contract)
      when private.current_role() in ('owner','contracts_manager','supervisor') then true
      else p_area is not null and private.can_access_area(p_area) end)
$$;
create function private.can_read_document(p_contract uuid,p_area uuid,p_classification text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_access_contract(p_contract) and
    (case when p_classification = 'commercial' then private.can_view_financials(p_contract)
      else p_classification = 'operational' and (p_area is null or private.can_access_area(p_area)) end)
$$;
create function private.can_upload_path(p_path text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.document_revisions d where d.object_path = p_path and d.created_by = auth.uid()
    and d.uploaded_at is null and private.can_upload_document(d.contract_id,d.work_area_id,d.classification))
$$;
create function private.can_read_path(p_path text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.document_revisions d where d.object_path = p_path and d.uploaded_at is not null
    and private.can_read_document(d.contract_id,d.work_area_id,d.classification))
$$;

alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_commercials enable row level security;
alter table public.contract_assignments enable row level security;
alter table public.work_areas enable row level security;
alter table public.work_packages enable row level security;
alter table public.package_assignments enable row level security;
alter table public.document_revisions enable row level security;
alter table public.audit_events enable row level security;
alter table private.idempotency_keys enable row level security;

create policy organisation_read on public.organisations for select to authenticated using (id = private.current_org());
create policy member_read on public.organisation_members for select to authenticated using (
  organisation_id = private.current_org() and (private.is_owner() or user_id = auth.uid()
    or private.current_role() = 'contracts_manager'));
create policy contract_read on public.contracts for select to authenticated using (private.can_access_contract(id));
create policy commercial_read on public.contract_commercials for select to authenticated using (private.can_view_financials(contract_id));
create policy area_read on public.work_areas for select to authenticated using (private.can_access_area(id));
create policy package_read on public.work_packages for select to authenticated using (private.can_access_package(id));
create policy contract_assignment_read on public.contract_assignments for select to authenticated using (
  private.can_manage_contract(contract_id) or (user_id = auth.uid() and private.can_access_contract(contract_id)));
create policy contract_assignment_insert on public.contract_assignments for insert to authenticated with check (private.can_allocate_contract_user(contract_id,user_id));
create policy contract_assignment_update on public.contract_assignments for update to authenticated using (private.can_allocate_contract_user(contract_id,user_id)) with check (private.can_allocate_contract_user(contract_id,user_id));
create policy contract_assignment_delete on public.contract_assignments for delete to authenticated using (private.can_allocate_contract_user(contract_id,user_id));
create policy package_assignment_read on public.package_assignments for select to authenticated using (
  private.can_manage_contract(contract_id) or (user_id = auth.uid() and private.can_access_package(work_package_id)));
create policy package_assignment_insert on public.package_assignments for insert to authenticated with check (private.can_manage_contract(contract_id));
create policy package_assignment_delete on public.package_assignments for delete to authenticated using (private.can_manage_contract(contract_id));
create policy document_read on public.document_revisions for select to authenticated using (
  (uploaded_at is not null and private.can_read_document(contract_id,work_area_id,classification))
  or (uploaded_at is null and (created_by = auth.uid() or private.can_manage_contract(contract_id))
    and private.can_read_document(contract_id,work_area_id,classification)));
create policy document_insert on public.document_revisions for insert to authenticated with check (
  created_by = auth.uid() and uploaded_at is null and organisation_id = private.current_org()
  and private.can_upload_document(contract_id,work_area_id,classification));
create policy audit_read on public.audit_events for select to authenticated using (
  organisation_id = private.current_org() and ((contract_id is null and private.is_owner())
    or (contract_id is not null and private.can_access_contract(contract_id)
      and private.current_role() in ('owner','contracts_manager','supervisor')
      and (not commercial or private.can_view_financials(contract_id)))));

-- Explicit grants: protected state can be changed only through checked RPCs.
revoke all on public.organisations,public.organisation_members,public.contracts,public.contract_commercials,
  public.contract_assignments,public.work_areas,public.work_packages,public.package_assignments,
  public.document_revisions,public.audit_events from public,anon,authenticated;
grant select(id,name) on public.organisations to authenticated;
grant select on public.organisation_members,public.contracts,public.contract_commercials,
  public.contract_assignments,public.work_areas,public.work_packages,public.package_assignments,
  public.document_revisions,public.audit_events to authenticated;
grant insert,update,delete on public.contract_assignments to authenticated;
grant insert,delete on public.package_assignments to authenticated;
grant insert on public.document_revisions to authenticated;
revoke all on private.idempotency_keys from public,anon,authenticated;

-- Real actor and immutable revisions; no user-supplied acceptance/state actor.
create function private.guard_assignment() returns trigger language plpgsql security definer set search_path = '' as $$
declare m public.organisation_members;
begin
  select * into m from public.organisation_members where organisation_id = new.organisation_id and user_id = new.user_id and active;
  if not found then raise exception 'Active organisation member required' using errcode='23514'; end if;
  if tg_table_name = 'contract_assignments' and m.role not in ('contracts_manager','supervisor') then
    raise exception 'Site contract assignments require manager or supervisor role' using errcode='23514';
  end if;
  if private.current_role()='contracts_manager' and m.role='contracts_manager' and new.user_id<>auth.uid() then
    raise exception 'Managers may allocate operational staff only' using errcode='42501';
  end if;
  if tg_table_name = 'package_assignments' and m.role not in ('lead_installer','subcontract_installer') then
    raise exception 'Package assignments require installer role' using errcode='23514';
  end if;
  if tg_op = 'UPDATE' and (new.organisation_id,new.contract_id,new.user_id) is distinct from (old.organisation_id,old.contract_id,old.user_id) then
    raise exception 'Assignment identity is immutable' using errcode='23514';
  end if;
  return new;
end $$;
create trigger contract_assignment_guard before insert or update on public.contract_assignments for each row execute function private.guard_assignment();
create trigger package_assignment_guard before insert on public.package_assignments for each row execute function private.guard_assignment();

create function private.guard_document() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is distinct from auth.uid() or auth.uid() is null or new.uploaded_at is not null then
      raise exception 'Document actor/completion is controlled' using errcode='42501';
    end if;
    new.created_at := now();
  elsif tg_op = 'DELETE' then
    raise exception 'Document revisions are immutable' using errcode='42501';
  elsif (to_jsonb(new) - 'uploaded_at') is distinct from (to_jsonb(old) - 'uploaded_at')
    or old.uploaded_at is not null or new.uploaded_at is null then
    raise exception 'Document revisions are immutable' using errcode='42501';
  end if;
  return new;
end $$;
create trigger document_guard before insert or update or delete on public.document_revisions for each row execute function private.guard_document();

create function private.audit_mutation() returns trigger language plpgsql security definer set search_path = '' as $$
declare r jsonb; previous jsonb; org uuid; contract uuid; entity text; changes jsonb; details jsonb;
begin
  r := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  previous := case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
  org := (r->>'organisation_id')::uuid;
  contract := case when tg_table_name='contracts' then (r->>'id')::uuid else (r->>'contract_id')::uuid end;
  entity := coalesce(r->>'id',r->>'work_package_id',r->>'contract_id',r->>'user_id');
  select coalesce(jsonb_agg(k),'[]'::jsonb) into changes from jsonb_object_keys(r) k
    where tg_op='DELETE' or r->k is distinct from previous->k;
  details := jsonb_build_object('changed_fields',changes);
  if tg_table_name='organisation_members' then
    details := details || jsonb_build_object('target_user_id',r->>'user_id',
      'before',jsonb_build_object('role',previous->'role','active',previous->'active','financial_access',previous->'financial_access'),
      'after',jsonb_build_object('role',r->'role','active',r->'active','financial_access',r->'financial_access'));
  elsif tg_table_name='contract_assignments' then
    details := details || jsonb_build_object('target_user_id',r->>'user_id',
      'before',jsonb_build_object('valid_from',previous->'valid_from','valid_until',previous->'valid_until'),
      'after',case when tg_op='DELETE' then null else jsonb_build_object('valid_from',r->'valid_from','valid_until',r->'valid_until') end);
  elsif tg_table_name='package_assignments' then
    details := details || jsonb_build_object('target_user_id',r->>'user_id','work_package_id',r->>'work_package_id');
  elsif tg_table_name='contract_commercials' then
    details := details || jsonb_build_object('before',previous-'organisation_id'-'contract_id'-'updated_at',
      'after',r-'organisation_id'-'contract_id'-'updated_at');
  elsif tg_table_name='document_revisions' then
    details := details || jsonb_build_object('document_reference',r->>'document_reference','revision',r->'revision',
      'classification',r->>'classification','sha256',r->>'sha256','bytes',r->'bytes','uploaded_at',r->'uploaded_at');
  end if;
  insert into public.audit_events(organisation_id,contract_id,actor_id,action,entity_type,entity_id,commercial,details)
    values(org,contract,auth.uid(),lower(tg_op),tg_table_name,entity,
      tg_table_name='contract_commercials' or (tg_table_name='document_revisions' and r->>'classification'='commercial'),details);
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger audit_contract after insert or update on public.contracts for each row execute function private.audit_mutation();
create trigger audit_commercial after insert or update on public.contract_commercials for each row execute function private.audit_mutation();
create trigger audit_member after insert or update on public.organisation_members for each row execute function private.audit_mutation();
create trigger audit_assignment after insert or update or delete on public.contract_assignments for each row execute function private.audit_mutation();
create trigger audit_package_assignment after insert or delete on public.package_assignments for each row execute function private.audit_mutation();
create trigger audit_area after insert on public.work_areas for each row execute function private.audit_mutation();
create trigger audit_package after insert on public.work_packages for each row execute function private.audit_mutation();
create trigger audit_document after insert or update on public.document_revisions for each row execute function private.audit_mutation();

create function private.assert_keys(p_data jsonb,p_keys text[]) returns void language plpgsql set search_path='' as $$
declare key text; value jsonb;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' or exists(select 1 from jsonb_object_keys(p_data) k where not (k=any(p_keys))) then
    raise exception 'Invalid or unsupported fields' using errcode='22023';
  end if;
  if length(p_data::text)>100000 then raise exception 'Record too large' using errcode='22023'; end if;
  for key, value in select * from jsonb_each(p_data) loop
    if key = any(array['contract_value','labour_budget','materials_budget','preliminaries_budget','contingency','target_margin','retention_percent','quantity']) then
      if jsonb_typeof(value)<>'number' then raise exception 'Invalid numeric type: %',key using errcode='22023'; end if;
      if (value::text)::numeric < 0
        or (value::text)::numeric > (case when key='quantity' then 1000000 when key in ('target_margin','retention_percent') then 100 else 1000000000 end)
        or ((value::text)::numeric * 100) <> trunc((value::text)::numeric * 100) then
        raise exception 'Invalid decimal field: %', key using errcode='22023';
      end if;
      if key='target_margin' and (value::text)::numeric >= 100 then raise exception 'Margin must be below 100' using errcode='22023'; end if;
    elsif key in ('start_date','end_date') then
      if value <> 'null'::jsonb and (jsonb_typeof(value)<>'string' or (value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$') then
        raise exception 'Invalid date field: %', key using errcode='22023';
      end if;
    else
      if jsonb_typeof(value)<>'string' then raise exception 'Invalid text field: %',key using errcode='22023'; end if;
      if length(value #>> '{}') > (case key
        when 'reference' then 80 when 'name' then 160 when 'client' then 160 when 'principal_contractor' then 160
        when 'address' then 1000 when 'site_contact' then 500 when 'scope' then 8000 when 'exclusions' then 4000
        when 'tile_specification' then 4000 when 'substrate_details' then 4000 when 'installation_system' then 4000
        when 'movement_joints' then 4000 when 'working_hours' then 500 when 'location' then 500
        when 'substrate_notes' then 4000 when 'system_notes' then 4000 when 'payment_terms' then 4000 when 'unit' then 10
        else 2000 end) then raise exception 'Text field too long: %',key using errcode='22023'; end if;
    end if;
  end loop;
end $$;
create function private.request_result(p_org uuid,p_operation text,p_key uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare digest text; stored private.idempotency_keys;
begin
  if auth.uid() is null or p_key is null then raise exception 'Authenticated request key required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||auth.uid()::text||':'||p_operation||':'||p_key::text,0));
  digest := encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  select * into stored from private.idempotency_keys where organisation_id=p_org and actor_id=auth.uid() and operation=p_operation and request_key=p_key;
  if found then
    if stored.payload_digest<>digest then raise exception 'Request key reused with different payload' using errcode='22023'; end if;
    return stored.result_id;
  end if;
  return null;
end $$;
create function private.record_request(p_org uuid,p_operation text,p_key uuid,p_payload jsonb,p_result uuid) returns void
language sql security definer set search_path='' as $$
  insert into private.idempotency_keys(organisation_id,actor_id,operation,request_key,payload_digest,result_id)
    values(p_org,auth.uid(),p_operation,p_key,encode(sha256(convert_to(p_payload::text,'UTF8')),'hex'),p_result)
$$;

create function public.save_member(p_user uuid,p_display_name text,p_role text,p_financial_access boolean,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid; previous public.organisation_members;
begin
  org := private.current_org();
  if not private.is_owner() then raise exception 'Owner permission required' using errcode='42501'; end if;
  perform 1 from public.organisations where id=org for update;
  if org is distinct from private.current_org() or not private.is_owner() then raise exception 'Owner permission required' using errcode='42501'; end if;
  select * into previous from public.organisation_members where user_id=p_user;
  if found and previous.organisation_id<>org then raise exception 'User belongs to another organisation' using errcode='42501'; end if;
  if found and previous.role='owner' and previous.active and (not p_active or p_role<>'owner')
    and not exists(select 1 from public.organisation_members where organisation_id=org and user_id<>p_user and role='owner' and active) then
    raise exception 'Cannot remove the last active owner' using errcode='23514';
  end if;
  insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access,active)
    values(org,p_user,p_display_name,p_role::public.operations_role,p_financial_access,p_active)
    on conflict(user_id) do update set display_name=excluded.display_name,role=excluded.role,financial_access=excluded.financial_access,active=excluded.active;
end $$;

create function public.create_contract(p_organisation uuid,p_request_key uuid,p_data jsonb,p_commercial jsonb default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; payload jsonb;
begin
  if p_organisation is distinct from private.current_org() or private.current_role() not in ('owner','contracts_manager') or private.current_role() is null then
    raise exception 'Contract management permission required' using errcode='42501';
  end if;
  perform private.assert_keys(p_data,array['reference','name','client','principal_contractor','address','site_contact','scope','exclusions',
    'tile_specification','substrate_details','installation_system','movement_joints','access_restrictions','working_hours','insurance_requirements',
    'defects_liability','start_date','end_date']);
  payload:=jsonb_build_object('data',p_data,'commercial',p_commercial);
  result:=private.request_result(p_organisation,'create_contract',p_request_key,payload);
  if result is not null then return result; end if;
  insert into public.contracts(organisation_id,reference,name,client,principal_contractor,address,site_contact,scope,exclusions,
    tile_specification,substrate_details,installation_system,movement_joints,access_restrictions,working_hours,insurance_requirements,defects_liability,start_date,end_date,created_by)
  values(p_organisation,p_data->>'reference',p_data->>'name',coalesce(p_data->>'client',''),coalesce(p_data->>'principal_contractor',''),coalesce(p_data->>'address',''),
    coalesce(p_data->>'site_contact',''),coalesce(p_data->>'scope',''),coalesce(p_data->>'exclusions',''),coalesce(p_data->>'tile_specification',''),
    coalesce(p_data->>'substrate_details',''),coalesce(p_data->>'installation_system',''),coalesce(p_data->>'movement_joints',''),coalesce(p_data->>'access_restrictions',''),
    coalesce(p_data->>'working_hours',''),coalesce(p_data->>'insurance_requirements',''),coalesce(p_data->>'defects_liability',''),
    nullif(p_data->>'start_date','')::date,nullif(p_data->>'end_date','')::date,auth.uid()) returning id into result;
  if private.current_role()='contracts_manager' then
    insert into public.contract_assignments(contract_id,organisation_id,user_id) values(result,p_organisation,auth.uid());
  end if;
  if p_commercial is not null then perform public.save_contract_commercial(result,0,p_commercial); end if;
  perform private.record_request(p_organisation,'create_contract',p_request_key,payload,result);
  return result;
end $$;

create function public.update_contract(p_contract uuid,p_version integer,p_data jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare c public.contracts;
begin
  if not private.can_manage_contract(p_contract) then raise exception 'Contract management permission required' using errcode='42501'; end if;
  perform private.assert_keys(p_data,array['reference','name','client','principal_contractor','address','site_contact','scope','exclusions',
    'tile_specification','substrate_details','installation_system','movement_joints','access_restrictions','working_hours','insurance_requirements',
    'defects_liability','start_date','end_date']);
  select * into c from public.contracts where id=p_contract for update;
  if c.version is distinct from p_version then raise exception 'Contract changed; reload before saving' using errcode='40001'; end if;
  update public.contracts set reference=coalesce(p_data->>'reference',reference),name=coalesce(p_data->>'name',name),client=coalesce(p_data->>'client',client),
    principal_contractor=coalesce(p_data->>'principal_contractor',principal_contractor),address=coalesce(p_data->>'address',address),site_contact=coalesce(p_data->>'site_contact',site_contact),
    scope=coalesce(p_data->>'scope',scope),exclusions=coalesce(p_data->>'exclusions',exclusions),tile_specification=coalesce(p_data->>'tile_specification',tile_specification),
    substrate_details=coalesce(p_data->>'substrate_details',substrate_details),installation_system=coalesce(p_data->>'installation_system',installation_system),
    movement_joints=coalesce(p_data->>'movement_joints',movement_joints),access_restrictions=coalesce(p_data->>'access_restrictions',access_restrictions),
    working_hours=coalesce(p_data->>'working_hours',working_hours),insurance_requirements=coalesce(p_data->>'insurance_requirements',insurance_requirements),
    defects_liability=coalesce(p_data->>'defects_liability',defects_liability),
    start_date=case when p_data?'start_date' then nullif(p_data->>'start_date','')::date else start_date end,
    end_date=case when p_data?'end_date' then nullif(p_data->>'end_date','')::date else end_date end,
    version=version+1,updated_at=now() where id=p_contract returning version into p_version;
  return p_version;
end $$;

create function public.save_contract_commercial(p_contract uuid,p_version integer,p_data jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare c public.contracts; previous public.contract_commercials; next_version integer;
begin
  if not private.can_view_financials(p_contract) then raise exception 'Financial permission required' using errcode='42501'; end if;
  if not private.is_owner() and p_data?'target_margin' then raise exception 'Target margin is owner configured' using errcode='42501'; end if;
  perform private.assert_keys(p_data,array['contract_value','labour_budget','materials_budget','preliminaries_budget','contingency','target_margin','payment_terms','retention_percent']);
  select * into c from public.contracts where id=p_contract for update;
  select * into previous from public.contract_commercials where contract_id=p_contract;
  if coalesce(previous.version,0) is distinct from p_version then raise exception 'Commercial record changed; reload before saving' using errcode='40001'; end if;
  next_version:=coalesce(previous.version,0)+1;
  insert into public.contract_commercials(contract_id,organisation_id,contract_value,labour_budget,materials_budget,preliminaries_budget,contingency,target_margin,payment_terms,retention_percent,version)
  values(p_contract,c.organisation_id,coalesce((p_data->>'contract_value')::numeric,previous.contract_value,0),coalesce((p_data->>'labour_budget')::numeric,previous.labour_budget,0),
    coalesce((p_data->>'materials_budget')::numeric,previous.materials_budget,0),coalesce((p_data->>'preliminaries_budget')::numeric,previous.preliminaries_budget,0),
    coalesce((p_data->>'contingency')::numeric,previous.contingency,0),coalesce((p_data->>'target_margin')::numeric,previous.target_margin,
      (select target_margin from public.organisations where id=c.organisation_id)),coalesce(p_data->>'payment_terms',previous.payment_terms,''),
    coalesce((p_data->>'retention_percent')::numeric,previous.retention_percent,0),next_version)
  on conflict(contract_id) do update set contract_value=excluded.contract_value,labour_budget=excluded.labour_budget,materials_budget=excluded.materials_budget,
    preliminaries_budget=excluded.preliminaries_budget,contingency=excluded.contingency,target_margin=excluded.target_margin,payment_terms=excluded.payment_terms,
    retention_percent=excluded.retention_percent,version=excluded.version,updated_at=now();
  return next_version;
end $$;

create function public.create_work_area(p_contract uuid,p_request_key uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; org uuid; payload jsonb;
begin
  if not private.can_manage_contract(p_contract) then raise exception 'Contract management permission required' using errcode='42501'; end if;
  perform private.assert_keys(p_data,array['name','location','substrate_notes','system_notes']);
  org:=private.current_org();payload:=jsonb_build_object('contract',p_contract,'data',p_data);
  result:=private.request_result(org,'create_work_area',p_request_key,payload);
  if result is not null then return result; end if;
  insert into public.work_areas(organisation_id,contract_id,name,location,substrate_notes,system_notes,created_by)
    values(org,p_contract,p_data->>'name',coalesce(p_data->>'location',''),coalesce(p_data->>'substrate_notes',''),coalesce(p_data->>'system_notes',''),auth.uid()) returning id into result;
  perform private.record_request(org,'create_work_area',p_request_key,payload,result);
  return result;
end $$;
create function public.create_work_package(p_area uuid,p_request_key uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; a public.work_areas; payload jsonb;
begin
  select * into a from public.work_areas where id=p_area;
  if not found or not private.can_manage_contract(a.contract_id) then raise exception 'Contract management permission required' using errcode='42501'; end if;
  perform private.assert_keys(p_data,array['name','quantity','unit']);
  payload:=jsonb_build_object('area',p_area,'data',p_data);
  result:=private.request_result(a.organisation_id,'create_work_package',p_request_key,payload);
  if result is not null then return result; end if;
  insert into public.work_packages(organisation_id,contract_id,work_area_id,name,quantity,unit)
    values(a.organisation_id,a.contract_id,p_area,p_data->>'name',(p_data->>'quantity')::numeric,p_data->>'unit') returning id into result;
  perform private.record_request(a.organisation_id,'create_work_package',p_request_key,payload,result);
  return result;
end $$;

-- Only the server can certify stored bytes after downloading and verifying them.
-- Client Storage uploads alone do not verify actual magic bytes or content hashes.
create function public.complete_document_upload(p_document uuid,p_actor uuid,p_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare d public.document_revisions; original_claims text; original_sub text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted server verification required' using errcode='42501';
  end if;
  select * into d from public.document_revisions where id=p_document for update;
  if not found or d.created_by is distinct from p_actor or d.sha256 is distinct from p_sha256 then
    raise exception 'Verified uploader and content hash must match reservation' using errcode='42501';
  end if;
  original_claims := current_setting('request.jwt.claims',true);
  original_sub := current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',p_actor)::text,true);
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  if not private.can_upload_document(d.contract_id,d.work_area_id,d.classification) then
    raise exception 'Uploader no longer has permission for this document' using errcode='42501';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='tilespec-evidence' and name=d.object_path
    and metadata->>'size'=d.bytes::text and metadata->>'mimetype'=d.mime_type) then
    raise exception 'File is missing or upload size/type does not match' using errcode='23514';
  end if;
  if d.uploaded_at is null then update public.document_revisions set uploaded_at=now() where id=d.id; end if;
  perform set_config('request.jwt.claims',coalesce(original_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(original_sub,''),true);
end $$;

-- Supabase private Storage. Reserved metadata owns an immutable object path.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('tilespec-evidence','tilespec-evidence',false,4194304,array['application/pdf','image/jpeg','image/png']);
create policy tilespec_evidence_insert on storage.objects for insert to authenticated with check (
  bucket_id='tilespec-evidence' and private.can_upload_path(name));
create policy tilespec_evidence_read on storage.objects for select to authenticated using (
  bucket_id='tilespec-evidence' and private.can_read_path(name));
-- No UPDATE/DELETE policy: overwrite and deletion of evidence are prohibited.

-- Functions default PUBLIC execution is revoked explicitly, including private internals.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.current_org(),private.current_role(),private.is_owner(),private.can_manage_contract(uuid),
  private.can_access_contract(uuid),private.can_allocate_contract_user(uuid,uuid),private.can_view_financials(uuid),private.can_access_package(uuid),private.can_access_area(uuid),
  private.can_upload_document(uuid,uuid,text),private.can_read_document(uuid,uuid,text),private.can_upload_path(text),private.can_read_path(text) to authenticated;
revoke all on function public.save_member(uuid,text,text,boolean,boolean),public.create_contract(uuid,uuid,jsonb,jsonb),
  public.update_contract(uuid,integer,jsonb),public.save_contract_commercial(uuid,integer,jsonb),
  public.create_work_area(uuid,uuid,jsonb),public.create_work_package(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_member(uuid,text,text,boolean,boolean),public.create_contract(uuid,uuid,jsonb,jsonb),
  public.update_contract(uuid,integer,jsonb),public.save_contract_commercial(uuid,integer,jsonb),
  public.create_work_area(uuid,uuid,jsonb),public.create_work_package(uuid,uuid,jsonb) to authenticated;
revoke all on function public.complete_document_upload(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_document_upload(uuid,uuid,text) to service_role;
commit;
