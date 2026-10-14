-- Supervisor V2, Phase 2A: subcontractor companies as proper records.
-- A subcontractor or labour agency is one company record with a stable ID.
-- Its gangs and operatives link to it by that ID, so retyped or misspelt
-- names can no longer split one company in two. Insurance and accreditation
-- entries are dated and permanent: a renewal is a new entry, and an entry made
-- in error is voided with a reason. This is the structure for later compliance
-- work, not a compliance workflow: nothing here blocks planning or site work.
--
-- Additive only. The free-text teams.contractor_name and operatives.company_name
-- columns stay and every existing value is kept. Existing names are linked to
-- new company records, with names differing only in case or spacing treated as
-- one company. From now on those columns only mirror the linked company's name
-- when it is linked, for readers that cannot see company records.
begin;

do $$
begin
  if to_regclass('public.teams') is null or to_regclass('public.operatives') is null
    or to_regclass('public.team_memberships') is null or to_regclass('public.actual_allocations') is null
    or to_regprocedure('public.location_work_history(uuid,timestamptz,timestamptz)') is null
    or to_regprocedure('private.guard_append_only()') is null or to_regprocedure('private.assert_choice(text,text,text[])') is null
    or to_regprocedure('private.is_office()') is null or to_regprocedure('private.is_site_staff()') is null then
    raise exception 'Preflight failed: apply 20261014093000_site_allocations.sql first and review supabase/inspection/subcontractor-companies-preflight.sql.';
  end if;
  if to_regclass('public.subcontractor_companies') is not null or to_regclass('public.company_insurances') is not null
    or to_regclass('public.company_accreditations') is not null or to_regprocedure('private.company_label(text)') is not null
    or exists (select 1 from pg_attribute where attrelid in ('public.teams'::regclass, 'public.operatives'::regclass)
      and attname = 'company_id' and not attisdropped) then
    raise exception 'Preflight failed: company objects already exist (schema drift). Review supabase/inspection/subcontractor-companies-preflight.sql before applying.';
  end if;
end $$;

-- One spelling per company: surrounding and repeated whitespace is removed.
create function private.company_label(p_name text) returns text language sql immutable set search_path='' as $$
  select btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'))
$$;

-- created_by is null only for trusted administrative SQL, such as the backfill below.
create table public.subcontractor_companies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null check (name = private.company_label(name) and length(name) between 1 and 160),
  company_number text not null default '' check (length(company_number) <= 40),
  contact_name text not null default '' check (length(contact_name) <= 160),
  contact_phone text not null default '' check (length(contact_phone) <= 40),
  contact_email text not null default '' check (length(contact_email) <= 254),
  address text not null default '' check (length(address) <= 1000),
  notes text not null default '' check (length(notes) <= 4000),
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id)
);
-- Unique whether active or not: a returning subcontractor is reactivated with
-- its history instead of being entered a second time.
create unique index subcontractor_companies_name on public.subcontractor_companies(organisation_id, lower(name));

create table public.company_insurances (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  company_id uuid not null,
  insurance_type text not null check (insurance_type in ('public_liability','employers_liability','professional_indemnity','contract_works','other')),
  insurer text not null default '' check (length(insurer) <= 160),
  policy_number text not null default '' check (length(policy_number) <= 80),
  cover_amount bigint check (cover_amount is null or cover_amount >= 0),
  starts_on date,
  expires_on date not null,
  notes text not null default '' check (length(notes) <= 2000),
  recorded_by uuid default auth.uid() references auth.users(id),
  recorded_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text check (void_reason is null or length(trim(void_reason)) between 5 and 2000),
  foreign key (organisation_id, company_id) references public.subcontractor_companies(organisation_id, id),
  check (starts_on is null or expires_on >= starts_on),
  check ((voided_at is null) = (void_reason is null))
);
create index company_insurances_company on public.company_insurances(company_id, expires_on desc);

create table public.company_accreditations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  company_id uuid not null,
  scheme text not null check (length(trim(scheme)) between 1 and 160),
  reference text not null default '' check (length(reference) <= 80),
  expires_on date,
  notes text not null default '' check (length(notes) <= 2000),
  recorded_by uuid default auth.uid() references auth.users(id),
  recorded_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text check (void_reason is null or length(trim(void_reason)) between 5 and 2000),
  foreign key (organisation_id, company_id) references public.subcontractor_companies(organisation_id, id),
  check ((voided_at is null) = (void_reason is null))
);
create index company_accreditations_company on public.company_accreditations(company_id);

-- Directly employed people and direct teams are never linked to a subcontractor.
alter table public.teams add column company_id uuid,
  add constraint teams_company foreign key (organisation_id, company_id) references public.subcontractor_companies(organisation_id, id),
  add constraint teams_direct_without_company check (company_id is null or kind <> 'direct_team');
alter table public.operatives add column company_id uuid,
  add constraint operatives_company foreign key (organisation_id, company_id) references public.subcontractor_companies(organisation_id, id),
  add constraint operatives_direct_without_company check (company_id is null or engagement <> 'direct_employee');
create index teams_company on public.teams(company_id) where company_id is not null;
create index operatives_company on public.operatives(company_id) where company_id is not null;

alter table public.subcontractor_companies enable row level security;
alter table public.company_insurances enable row level security;
alter table public.company_accreditations enable row level security;
-- Office and supervisors see every company, including whether its insurance is
-- current. Installers see none: company notes and other contractors' details
-- are not theirs to read. Their own gang still shows its company name through
-- the mirrored team column.
create policy company_read on public.subcontractor_companies for select to authenticated using (
  organisation_id = private.current_org() and private.is_site_staff());
create policy company_insurance_read on public.company_insurances for select to authenticated using (
  organisation_id = private.current_org() and private.is_site_staff());
create policy company_accreditation_read on public.company_accreditations for select to authenticated using (
  organisation_id = private.current_org() and private.is_site_staff());
revoke all on public.subcontractor_companies, public.company_insurances, public.company_accreditations from public, anon, authenticated;
grant select on public.subcontractor_companies, public.company_insurances, public.company_accreditations to authenticated;

create trigger company_insurance_append_only before update or delete on public.company_insurances
  for each row execute function private.guard_append_only('voided_at','voided_by','void_reason');
create trigger company_accreditation_append_only before update or delete on public.company_accreditations
  for each row execute function private.guard_append_only('voided_at','voided_by','void_reason');
create trigger audit_company after insert or update on public.subcontractor_companies for each row execute function private.audit_mutation();
create trigger audit_company_insurance after insert or update on public.company_insurances for each row execute function private.audit_mutation();
create trigger audit_company_accreditation after insert or update on public.company_accreditations for each row execute function private.audit_mutation();

-- Link the names already typed against gangs and operatives. The most common
-- spelling becomes the company name. Rows are linked without changing their
-- version, so forms already open still save; the audit log records each link
-- with no actor, marking it as administrative.
insert into public.subcontractor_companies(organisation_id, name, created_by)
select organisation_id, mode() within group (order by name), null
from (
  select organisation_id, private.company_label(contractor_name) as name from public.teams where kind <> 'direct_team'
  union all
  select organisation_id, private.company_label(company_name) from public.operatives where engagement <> 'direct_employee'
) typed
where name <> ''
group by organisation_id, lower(name);
update public.teams t set company_id = c.id from public.subcontractor_companies c
where c.organisation_id = t.organisation_id and t.kind <> 'direct_team'
  and private.company_label(t.contractor_name) <> '' and lower(c.name) = lower(private.company_label(t.contractor_name));
update public.operatives o set company_id = c.id from public.subcontractor_companies c
where c.organisation_id = o.organisation_id and o.engagement <> 'direct_employee'
  and private.company_label(o.company_name) <> '' and lower(c.name) = lower(private.company_label(o.company_name));

-- Returns the name of a company that may be linked now, holding it so it cannot
-- be deactivated until the caller commits. No company links nothing.
create function private.linkable_company(p_company uuid) returns text language plpgsql set search_path='' as $$
declare label text;
begin
  if p_company is null then return ''; end if;
  select c.name into label from public.subcontractor_companies c
  where c.id = p_company and c.organisation_id = private.current_org() and c.active for share;
  if not found then raise exception 'That company is inactive or not on record. Choose an active company.' using errcode='23514'; end if;
  return label;
end $$;

-- Applies the named fields of a request to a company, validating each one.
create function private.apply_company_fields(c public.subcontractor_companies, p_data jsonb) returns public.subcontractor_companies
language plpgsql stable set search_path='' as $$
begin
  if p_data ? 'name' then c.name := private.company_label(private.field_text(p_data, 'name', 160, true)); end if;
  if p_data ? 'company_number' then c.company_number := coalesce(private.field_text(p_data, 'company_number', 40), ''); end if;
  if p_data ? 'contact_name' then c.contact_name := coalesce(private.field_text(p_data, 'contact_name', 160), ''); end if;
  if p_data ? 'contact_phone' then c.contact_phone := coalesce(private.field_text(p_data, 'contact_phone', 40), ''); end if;
  if p_data ? 'contact_email' then c.contact_email := coalesce(private.field_text(p_data, 'contact_email', 254), ''); end if;
  if p_data ? 'address' then c.address := coalesce(private.field_text(p_data, 'address', 1000), ''); end if;
  if p_data ? 'notes' then c.notes := coalesce(private.field_text(p_data, 'notes', 4000), ''); end if;
  if coalesce(c.contact_email, '') <> '' and c.contact_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid contact email address, or leave it blank' using errcode='22023';
  end if;
  return c;
end $$;

create function private.assert_company_name_free(p_org uuid, p_name text, p_except uuid) returns void
language plpgsql stable set search_path='' as $$
declare existing public.subcontractor_companies;
begin
  select * into existing from public.subcontractor_companies
  where organisation_id = p_org and lower(name) = lower(p_name) and id is distinct from p_except;
  if found then
    raise exception 'A company called % is already on record%', existing.name,
      case when existing.active then '' else ' (inactive: reactivate it instead)' end using errcode='23505';
  end if;
end $$;

-- Expiry dates are checked for typing slips only; an expired entry may still
-- be recorded so the history is complete.
create function private.assert_cover_dates(p_starts date, p_expires date) returns void language plpgsql stable set search_path='' as $$
begin
  if p_expires is not null and (p_expires < date '2000-01-01' or p_expires > private.site_today() + 3653) then
    raise exception 'Check the expiry date: it must be within ten years from today' using errcode='22023';
  end if;
  if p_starts is not null and (p_starts < date '2000-01-01' or p_starts > private.site_today() + 3653) then
    raise exception 'Check the start date' using errcode='22023';
  end if;
  if p_starts is not null and p_expires is not null and p_expires < p_starts then
    raise exception 'The expiry date must be on or after the start date' using errcode='22023';
  end if;
end $$;

create function public.create_company(p_request_key uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); result uuid; c public.subcontractor_companies;
begin
  if not private.is_office() then raise exception 'Office permission required' using errcode='42501'; end if;
  perform private.only_keys(p_data, array['name','company_number','contact_name','contact_phone','contact_email','address','notes']);
  result := private.request_result(org, 'create_company', p_request_key, p_data);
  if result is not null then return result; end if;
  if not (p_data ? 'name') then raise exception 'Missing required field: name' using errcode='22023'; end if;
  c := private.apply_company_fields(c, p_data);
  perform private.assert_company_name_free(org, c.name, null);
  insert into public.subcontractor_companies(organisation_id, name, company_number, contact_name, contact_phone, contact_email, address, notes, created_by)
  values (org, c.name, coalesce(c.company_number, ''), coalesce(c.contact_name, ''), coalesce(c.contact_phone, ''),
    coalesce(c.contact_email, ''), coalesce(c.address, ''), coalesce(c.notes, ''), auth.uid())
  returning id into result;
  perform private.record_request(org, 'create_company', p_request_key, p_data, result);
  return result;
end $$;

-- A company is deactivated only once none of its gangs or operatives is still
-- active, so an active gang never belongs to an inactive company.
create function public.update_company(p_company uuid, p_version integer, p_data jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare c public.subcontractor_companies; changed public.subcontractor_companies; next_version integer; active_teams integer; active_people integer;
begin
  select * into c from public.subcontractor_companies where id = p_company for update;
  if not found or c.organisation_id is distinct from private.current_org() or not private.is_office() then
    raise exception 'Office permission required' using errcode='42501';
  end if;
  perform private.only_keys(p_data, array['name','company_number','contact_name','contact_phone','contact_email','address','notes','active']);
  if c.version is distinct from p_version then raise exception 'Company changed; reload before saving' using errcode='40001'; end if;
  changed := private.apply_company_fields(c, p_data - 'active');
  changed.active := coalesce(private.field_boolean(p_data, 'active'), c.active);
  if lower(changed.name) <> lower(c.name) then perform private.assert_company_name_free(c.organisation_id, changed.name, c.id); end if;
  if c.active and not changed.active then
    select count(*) into active_teams from public.teams where company_id = c.id and active;
    select count(*) into active_people from public.operatives where company_id = c.id and status <> 'inactive';
    if active_teams + active_people > 0 then
      raise exception 'This company still has %. Deactivate them or link them to another company first.',
        concat_ws(' and ', case when active_teams > 0 then active_teams || case when active_teams = 1 then ' active team' else ' active teams' end end,
          case when active_people > 0 then active_people || case when active_people = 1 then ' active operative' else ' active operatives' end end)
        using errcode='23514';
    end if;
  end if;
  update public.subcontractor_companies set name = changed.name, company_number = changed.company_number, contact_name = changed.contact_name,
    contact_phone = changed.contact_phone, contact_email = changed.contact_email, address = changed.address, notes = changed.notes,
    active = changed.active, version = version + 1, updated_at = now()
  where id = p_company returning version into next_version;
  return next_version;
end $$;

create function public.record_company_insurance(p_request_key uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); result uuid; company_ref uuid; type_value text; starts date; expires date;
begin
  if not private.is_office() then raise exception 'Office permission required' using errcode='42501'; end if;
  perform private.only_keys(p_data, array['company_id','insurance_type','insurer','policy_number','cover_amount','starts_on','expires_on','notes']);
  result := private.request_result(org, 'record_company_insurance', p_request_key, p_data);
  if result is not null then return result; end if;
  company_ref := private.field_uuid(p_data, 'company_id', true);
  if not exists (select 1 from public.subcontractor_companies where id = company_ref and organisation_id = org) then
    raise exception 'Company not found' using errcode='23503';
  end if;
  type_value := private.field_text(p_data, 'insurance_type', 30, true);
  perform private.assert_choice(type_value, 'insurance_type', array['public_liability','employers_liability','professional_indemnity','contract_works','other']);
  starts := private.field_date(p_data, 'starts_on');
  expires := private.field_date(p_data, 'expires_on', true);
  perform private.assert_cover_dates(starts, expires);
  insert into public.company_insurances(organisation_id, company_id, insurance_type, insurer, policy_number, cover_amount, starts_on, expires_on, notes, recorded_by)
  values (org, company_ref, type_value, coalesce(private.field_text(p_data, 'insurer', 160), ''), coalesce(private.field_text(p_data, 'policy_number', 80), ''),
    private.field_integer(p_data, 'cover_amount', 0, 2000000000), starts, expires, coalesce(private.field_text(p_data, 'notes', 2000), ''), auth.uid())
  returning id into result;
  perform private.record_request(org, 'record_company_insurance', p_request_key, p_data, result);
  return result;
end $$;

create function public.record_company_accreditation(p_request_key uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); result uuid; company_ref uuid; expires date;
begin
  if not private.is_office() then raise exception 'Office permission required' using errcode='42501'; end if;
  perform private.only_keys(p_data, array['company_id','scheme','reference','expires_on','notes']);
  result := private.request_result(org, 'record_company_accreditation', p_request_key, p_data);
  if result is not null then return result; end if;
  company_ref := private.field_uuid(p_data, 'company_id', true);
  if not exists (select 1 from public.subcontractor_companies where id = company_ref and organisation_id = org) then
    raise exception 'Company not found' using errcode='23503';
  end if;
  expires := private.field_date(p_data, 'expires_on');
  perform private.assert_cover_dates(null, expires);
  insert into public.company_accreditations(organisation_id, company_id, scheme, reference, expires_on, notes, recorded_by)
  values (org, company_ref, private.field_text(p_data, 'scheme', 160, true), coalesce(private.field_text(p_data, 'reference', 80), ''),
    expires, coalesce(private.field_text(p_data, 'notes', 2000), ''), auth.uid())
  returning id into result;
  perform private.record_request(org, 'record_company_accreditation', p_request_key, p_data, result);
  return result;
end $$;

create function public.void_company_insurance(p_insurance uuid, p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.company_insurances;
begin
  select * into r from public.company_insurances where id = p_insurance for update;
  if not found or r.organisation_id is distinct from private.current_org() or not private.is_office() then
    raise exception 'Office permission required' using errcode='42501';
  end if;
  if r.voided_at is not null then return; end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then
    raise exception 'Record why this insurance entry was made in error' using errcode='22023';
  end if;
  update public.company_insurances set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_insurance;
end $$;

create function public.void_company_accreditation(p_accreditation uuid, p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.company_accreditations;
begin
  select * into r from public.company_accreditations where id = p_accreditation for update;
  if not found or r.organisation_id is distinct from private.current_org() or not private.is_office() then
    raise exception 'Office permission required' using errcode='42501';
  end if;
  if r.voided_at is not null then return; end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then
    raise exception 'Record why this accreditation entry was made in error' using errcode='22023';
  end if;
  update public.company_accreditations set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_accreditation;
end $$;

-- Teams and operatives now name their company by ID. The free-text fields are
-- no longer accepted; the mirrored name is written from the company record.
create or replace function public.create_operative(p_request_key uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); result uuid; linked uuid; engagement_value text; company_ref uuid; company_label text;
begin
  if not private.is_site_staff() then raise exception 'Office or supervisor permission required' using errcode='42501'; end if;
  perform private.only_keys(p_data, array['display_name','engagement','company_id','user_id']);
  if p_data ? 'user_id' and not private.is_office() then raise exception 'Only the office can link an operative to a login' using errcode='42501'; end if;
  result := private.request_result(org, 'create_operative', p_request_key, p_data);
  if result is not null then return result; end if;
  engagement_value := private.field_text(p_data, 'engagement', 30, true);
  perform private.assert_choice(engagement_value, 'engagement', array['direct_employee','subcontractor','agency']);
  company_ref := private.field_uuid(p_data, 'company_id');
  if company_ref is not null and engagement_value = 'direct_employee' then
    raise exception 'A directly employed person is not linked to a subcontractor company' using errcode='22023';
  end if;
  company_label := private.linkable_company(company_ref);
  linked := private.field_uuid(p_data, 'user_id');
  if linked is not null and not exists (select 1 from public.organisation_members where organisation_id = org and user_id = linked and active) then
    raise exception 'A linked login must be an active member of this organisation' using errcode='23503';
  end if;
  insert into public.operatives(organisation_id, display_name, engagement, company_id, company_name, user_id, status, created_by)
  values (org, private.field_text(p_data, 'display_name', 160, true), engagement_value, company_ref, company_label,
    linked, case when private.is_office() then 'active' else 'provisional' end, auth.uid())
  returning id into result;
  perform private.record_request(org, 'create_operative', p_request_key, p_data, result);
  return result;
end $$;

create or replace function public.update_operative(p_operative uuid, p_version integer, p_data jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare o public.operatives; next_version integer; linked uuid; new_status text; new_engagement text; new_company uuid; company_label text;
begin
  select * into o from public.operatives where id = p_operative for update;
  if not found or o.organisation_id is distinct from private.current_org() or not private.is_office() then
    raise exception 'Office permission required' using errcode='42501';
  end if;
  perform private.only_keys(p_data, array['display_name','engagement','company_id','user_id','status']);
  if o.version is distinct from p_version then raise exception 'Operative changed; reload before saving' using errcode='40001'; end if;
  new_engagement := case when p_data ? 'engagement' then private.field_text(p_data, 'engagement', 30, true) else o.engagement end;
  perform private.assert_choice(new_engagement, 'engagement', array['direct_employee','subcontractor','agency']);
  new_status := private.field_text(p_data, 'status', 20);
  perform private.assert_choice(new_status, 'status', array['active','inactive']);
  new_status := coalesce(new_status, o.status);
  new_company := case when p_data ? 'company_id' then private.field_uuid(p_data, 'company_id') else o.company_id end;
  if new_company is not null and new_engagement = 'direct_employee' then
    raise exception 'A directly employed person is not linked to a subcontractor company' using errcode='22023';
  end if;
  if new_company is not null and (new_company is distinct from o.company_id or new_status <> 'inactive') then
    company_label := private.linkable_company(new_company);
  end if;
  linked := private.field_uuid(p_data, 'user_id');
  if linked is not null and not exists (select 1 from public.organisation_members where organisation_id = o.organisation_id and user_id = linked and active) then
    raise exception 'A linked login must be an active member of this organisation' using errcode='23503';
  end if;
  update public.operatives set
    display_name = case when p_data ? 'display_name' then private.field_text(p_data, 'display_name', 160, true) else display_name end,
    engagement = new_engagement, company_id = new_company,
    company_name = case when new_company is distinct from o.company_id then coalesce(company_label, '') else company_name end,
    user_id = case when p_data ? 'user_id' then linked else user_id end,
    status = new_status,
    version = version + 1, updated_at = now()
  where id = p_operative returning version into next_version;
  return next_version;
end $$;

create or replace function public.create_team(p_request_key uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); result uuid; kind_value text; company_ref uuid; company_label text;
begin
  if not private.is_office() then raise exception 'Office permission required' using errcode='42501'; end if;
  perform private.only_keys(p_data, array['name','kind','company_id']);
  result := private.request_result(org, 'create_team', p_request_key, p_data);
  if result is not null then return result; end if;
  kind_value := private.field_text(p_data, 'kind', 30, true);
  perform private.assert_choice(kind_value, 'kind', array['subcontract_gang','individual_subcontractor','direct_team','mixed','temporary']);
  company_ref := private.field_uuid(p_data, 'company_id');
  if company_ref is not null and kind_value = 'direct_team' then
    raise exception 'A direct team is not linked to a subcontractor company' using errcode='22023';
  end if;
  company_label := private.linkable_company(company_ref);
  insert into public.teams(organisation_id, name, kind, company_id, contractor_name, created_by)
  values (org, private.field_text(p_data, 'name', 160, true), kind_value, company_ref, company_label, auth.uid())
  returning id into result;
  perform private.record_request(org, 'create_team', p_request_key, p_data, result);
  return result;
end $$;

create or replace function public.update_team(p_team uuid, p_version integer, p_data jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare t public.teams; next_version integer; new_kind text; new_company uuid; new_active boolean; company_label text;
begin
  select * into t from public.teams where id = p_team for update;
  if not found or t.organisation_id is distinct from private.current_org() or not private.is_office() then
    raise exception 'Office permission required' using errcode='42501';
  end if;
  perform private.only_keys(p_data, array['name','kind','company_id','active']);
  if t.version is distinct from p_version then raise exception 'Team changed; reload before saving' using errcode='40001'; end if;
  new_kind := case when p_data ? 'kind' then private.field_text(p_data, 'kind', 30, true) else t.kind end;
  perform private.assert_choice(new_kind, 'kind', array['subcontract_gang','individual_subcontractor','direct_team','mixed','temporary']);
  new_company := case when p_data ? 'company_id' then private.field_uuid(p_data, 'company_id') else t.company_id end;
  new_active := case when p_data ? 'active' then coalesce(private.field_boolean(p_data, 'active'), t.active) else t.active end;
  if new_company is not null and new_kind = 'direct_team' then
    raise exception 'A direct team is not linked to a subcontractor company' using errcode='22023';
  end if;
  if new_company is not null and (new_company is distinct from t.company_id or new_active) then
    company_label := private.linkable_company(new_company);
  end if;
  update public.teams set
    name = case when p_data ? 'name' then private.field_text(p_data, 'name', 160, true) else name end,
    kind = new_kind, company_id = new_company,
    contractor_name = case when new_company is distinct from t.company_id then coalesce(company_label, '') else contractor_name end,
    active = new_active,
    version = version + 1, updated_at = now()
  where id = p_team returning version into next_version;
  return next_version;
end $$;

-- Same columns as before; contractor_name now comes from the company record
-- where the caller can read it, and from the mirrored team field otherwise.
create or replace function public.location_work_history(p_area uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table (actual_allocation_id uuid, work_area_id uuid, location_relation text, team_id uuid, team_name text,
  contractor_name text, team_lead text, stage text, work_date date, started_at timestamptz, ended_at timestamptz,
  planned_allocation_id uuid, deviations text[], deviation_reason text, confirmed_by uuid, operative_ids uuid[], operative_names text[])
language sql stable security invoker set search_path='' as $$
  select a.id, a.work_area_id,
    case when a.work_area_id = target.id then 'exact' when a.work_area_id = any(target.path_ids) then 'containing' else 'within' end,
    a.team_id, t.name, coalesce(c.name, t.contractor_name),
    (select o.display_name from public.team_memberships m join public.operatives o on o.id = m.operative_id
      where m.team_id = a.team_id and m.is_lead and m.voided_at is null
        and a.work_date between m.valid_from and coalesce(m.valid_until, a.work_date) limit 1),
    a.stage::text, a.work_date, a.started_at, a.ended_at, a.planned_allocation_id, a.deviations, a.deviation_reason, a.confirmed_by,
    array(select ao.operative_id from public.actual_allocation_operatives ao where ao.actual_allocation_id = a.id order by ao.joined_at, ao.operative_id),
    array(select o.display_name from public.actual_allocation_operatives ao join public.operatives o on o.id = ao.operative_id
      where ao.actual_allocation_id = a.id order by ao.joined_at, ao.operative_id)
  from public.work_areas target
    join public.work_areas candidate on candidate.contract_id = target.contract_id
      and (candidate.id = any(target.path_ids) or candidate.path_ids @> array[target.id])
    join public.actual_allocations a on a.work_area_id = candidate.id
    left join public.teams t on t.id = a.team_id
    left join public.subcontractor_companies c on c.id = t.company_id
  where target.id = p_area and a.voided_at is null
    and (p_to is null or a.started_at < p_to)
    and (p_from is null or a.ended_at is null or a.ended_at > p_from)
  order by a.started_at desc, a.id
$$;

revoke all on function private.company_label(text), private.linkable_company(uuid),
  private.apply_company_fields(public.subcontractor_companies,jsonb), private.assert_company_name_free(uuid,text,uuid),
  private.assert_cover_dates(date,date) from public, anon, authenticated;
revoke all on function public.create_company(uuid,jsonb), public.update_company(uuid,integer,jsonb), public.record_company_insurance(uuid,jsonb),
  public.record_company_accreditation(uuid,jsonb), public.void_company_insurance(uuid,text), public.void_company_accreditation(uuid,text),
  public.create_operative(uuid,jsonb), public.update_operative(uuid,integer,jsonb), public.create_team(uuid,jsonb), public.update_team(uuid,integer,jsonb),
  public.location_work_history(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.create_company(uuid,jsonb), public.update_company(uuid,integer,jsonb), public.record_company_insurance(uuid,jsonb),
  public.record_company_accreditation(uuid,jsonb), public.void_company_insurance(uuid,text), public.void_company_accreditation(uuid,text),
  public.create_operative(uuid,jsonb), public.update_operative(uuid,integer,jsonb), public.create_team(uuid,jsonb), public.update_team(uuid,integer,jsonb),
  public.location_work_history(uuid,timestamptz,timestamptz) to authenticated;
commit;
