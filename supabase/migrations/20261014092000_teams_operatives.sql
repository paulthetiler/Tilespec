-- Supervisor V2, Phase 1: operatives, teams and effective-dated membership.
-- Operatives are the people doing the work, whether or not they have a login.
-- Engagement (direct, subcontract, agency) is recorded but never selects a
-- different workflow. Membership rows are dated and never rewritten: leaving a
-- gang ends the row, and a row entered in error is voided with a reason.
-- No rates, tax or personal contact details are stored here.
begin;

do $$
begin
  if to_regclass('public.organisation_members') is null
    or to_regprocedure('private.only_keys(jsonb,text[])') is null
    or to_regprocedure('private.site_today()') is null
    or to_regprocedure('private.audit_mutation()') is null then
    raise exception 'Preflight failed: apply 20261014091000_site_locations.sql first and review supabase/inspection/supervisor-v2-preflight.sql.';
  end if;
  if to_regclass('public.operatives') is not null or to_regclass('public.teams') is not null
    or to_regclass('public.team_memberships') is not null or to_regprocedure('private.guard_append_only()') is not null then
    raise exception 'Preflight failed: team/operative objects already exist (schema drift). Review the preflight report before applying.';
  end if;
end $$;

-- created_by is null only for trusted administrative SQL, as with audit rows.
create table public.operatives (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  display_name text not null check (length(trim(display_name)) between 1 and 160),
  engagement text not null check (engagement in ('direct_employee','subcontractor','agency')),
  company_name text not null default '' check (length(company_name) <= 160),
  user_id uuid,
  status text not null default 'active' check (status in ('provisional','active','inactive')),
  version integer not null default 1 check (version > 0),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, user_id),
  foreign key (organisation_id, user_id) references public.organisation_members(organisation_id, user_id)
);
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null check (length(trim(name)) between 1 and 160),
  kind text not null check (kind in ('subcontract_gang','individual_subcontractor','direct_team','mixed','temporary')),
  contractor_name text not null default '' check (length(contractor_name) <= 160),
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id)
);
create unique index teams_active_name on public.teams(organisation_id, lower(trim(name))) where active;
create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  team_id uuid not null,
  operative_id uuid not null,
  is_lead boolean not null default false,
  valid_from date not null,
  valid_until date,
  ended_by uuid references auth.users(id),
  end_reason text check (end_reason is null or length(end_reason) <= 2000),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text check (void_reason is null or length(trim(void_reason)) between 5 and 2000),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (organisation_id, team_id) references public.teams(organisation_id, id),
  foreign key (organisation_id, operative_id) references public.operatives(organisation_id, id),
  check (valid_until is null or valid_until >= valid_from),
  check ((voided_at is null) = (void_reason is null))
);
create index team_memberships_team on public.team_memberships(team_id, valid_from);
create index team_memberships_operative on public.team_memberships(operative_id, valid_from);
create index operatives_user on public.operatives(user_id) where user_id is not null;

create function private.is_office() returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(private.current_role() in ('owner','contracts_manager'), false)
$$;
create function private.is_site_staff() returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(private.current_role() in ('owner','contracts_manager','supervisor'), false)
$$;
-- Teams the signed-in person currently belongs to, through their operative record.
create function private.my_team_ids() returns uuid[] language sql stable security definer set search_path='' as $$
  select coalesce(array_agg(distinct m.team_id), '{}') from public.team_memberships m
    join public.operatives o on o.id = m.operative_id
  where o.user_id = auth.uid() and o.organisation_id = private.current_org() and o.status = 'active'
    and m.voided_at is null and m.valid_from <= private.site_today()
    and (m.valid_until is null or m.valid_until >= private.site_today())
$$;
create function private.is_current_teammate(p_operative uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.team_memberships m where m.operative_id = p_operative
    and m.team_id = any(private.my_team_ids()) and m.voided_at is null
    and m.valid_from <= private.site_today() and (m.valid_until is null or m.valid_until >= private.site_today()))
$$;

alter table public.operatives enable row level security;
alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
-- Office and supervisors use the whole directory to plan and confirm work.
-- Installers see themselves and their current gang only, never other contractors.
create policy operative_read on public.operatives for select to authenticated using (
  organisation_id = private.current_org() and (private.is_site_staff() or user_id = auth.uid() or private.is_current_teammate(id)));
create policy team_read on public.teams for select to authenticated using (
  organisation_id = private.current_org() and (private.is_site_staff() or id = any(private.my_team_ids())));
create policy team_membership_read on public.team_memberships for select to authenticated using (
  organisation_id = private.current_org() and (private.is_site_staff() or team_id = any(private.my_team_ids())));
revoke all on public.operatives, public.teams, public.team_memberships from public, anon, authenticated;
grant select on public.operatives, public.teams, public.team_memberships to authenticated;

-- Shared by every Supervisor V2 history table: rows are never deleted, and only
-- the named lifecycle fields may be filled in, once, after creation.
create function private.guard_append_only() returns trigger language plpgsql security definer set search_path='' as $$
declare o jsonb; n jsonb; field text;
begin
  if tg_op = 'DELETE' then
    raise exception '% records are permanent; void them with a reason instead', tg_table_name using errcode='42501';
  end if;
  o := to_jsonb(old); n := to_jsonb(new);
  for field in select key from jsonb_each(n) where n->key is distinct from o->key loop
    if not (field = any(tg_argv)) or o->field <> 'null'::jsonb then
      raise exception 'Recorded % cannot be rewritten (field %)', tg_table_name, field using errcode='42501';
    end if;
  end loop;
  return new;
end $$;
create trigger team_membership_append_only before update or delete on public.team_memberships
  for each row execute function private.guard_append_only('valid_until','ended_by','end_reason','voided_at','voided_by','void_reason');

create function private.guard_team_membership() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('tilespec-team:' || new.team_id::text, 0));
  if exists (select 1 from public.team_memberships m where m.team_id = new.team_id and m.operative_id = new.operative_id
    and m.voided_at is null and daterange(m.valid_from, m.valid_until, '[]') && daterange(new.valid_from, new.valid_until, '[]')) then
    raise exception 'This operative is already a member of the team for overlapping dates' using errcode='23P01';
  end if;
  if new.is_lead and exists (select 1 from public.team_memberships m where m.team_id = new.team_id and m.is_lead
    and m.voided_at is null and daterange(m.valid_from, m.valid_until, '[]') && daterange(new.valid_from, new.valid_until, '[]')) then
    raise exception 'The team already has a lead for overlapping dates; end that lead membership first' using errcode='23P01';
  end if;
  new.created_at := now();
  return new;
end $$;
create trigger team_membership_guard before insert on public.team_memberships
  for each row execute function private.guard_team_membership();

create trigger audit_operative after insert or update on public.operatives for each row execute function private.audit_mutation();
create trigger audit_team after insert or update on public.teams for each row execute function private.audit_mutation();
create trigger audit_team_membership after insert or update on public.team_memberships for each row execute function private.audit_mutation();

create function private.assert_choice(p_value text, p_field text, p_choices text[]) returns void language plpgsql immutable set search_path='' as $$
begin
  if p_value is not null and not (p_value = any(p_choices)) then
    raise exception 'Field % must be one of: %', p_field, array_to_string(p_choices, ', ') using errcode='22023';
  end if;
end $$;

-- Supervisors may register someone who turns up unexpectedly; the record stays
-- provisional until the office confirms it.
create function public.create_operative(p_request_key uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); result uuid; linked uuid; engagement_value text;
begin
  if not private.is_site_staff() then raise exception 'Office or supervisor permission required' using errcode='42501'; end if;
  perform private.only_keys(p_data, array['display_name','engagement','company_name','user_id']);
  if p_data ? 'user_id' and not private.is_office() then raise exception 'Only the office can link an operative to a login' using errcode='42501'; end if;
  result := private.request_result(org, 'create_operative', p_request_key, p_data);
  if result is not null then return result; end if;
  engagement_value := private.field_text(p_data, 'engagement', 30, true);
  perform private.assert_choice(engagement_value, 'engagement', array['direct_employee','subcontractor','agency']);
  linked := private.field_uuid(p_data, 'user_id');
  if linked is not null and not exists (select 1 from public.organisation_members where organisation_id = org and user_id = linked and active) then
    raise exception 'A linked login must be an active member of this organisation' using errcode='23503';
  end if;
  insert into public.operatives(organisation_id, display_name, engagement, company_name, user_id, status, created_by)
  values (org, private.field_text(p_data, 'display_name', 160, true), engagement_value, coalesce(private.field_text(p_data, 'company_name', 160), ''),
    linked, case when private.is_office() then 'active' else 'provisional' end, auth.uid())
  returning id into result;
  perform private.record_request(org, 'create_operative', p_request_key, p_data, result);
  return result;
end $$;

create function public.update_operative(p_operative uuid, p_version integer, p_data jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare o public.operatives; next_version integer; linked uuid; new_status text;
begin
  select * into o from public.operatives where id = p_operative for update;
  if not found or o.organisation_id is distinct from private.current_org() or not private.is_office() then
    raise exception 'Office permission required' using errcode='42501';
  end if;
  perform private.only_keys(p_data, array['display_name','engagement','company_name','user_id','status']);
  if o.version is distinct from p_version then raise exception 'Operative changed; reload before saving' using errcode='40001'; end if;
  perform private.assert_choice(private.field_text(p_data, 'engagement', 30), 'engagement', array['direct_employee','subcontractor','agency']);
  new_status := private.field_text(p_data, 'status', 20);
  perform private.assert_choice(new_status, 'status', array['active','inactive']);
  linked := private.field_uuid(p_data, 'user_id');
  if linked is not null and not exists (select 1 from public.organisation_members where organisation_id = o.organisation_id and user_id = linked and active) then
    raise exception 'A linked login must be an active member of this organisation' using errcode='23503';
  end if;
  update public.operatives set
    display_name = case when p_data ? 'display_name' then private.field_text(p_data, 'display_name', 160, true) else display_name end,
    engagement = case when p_data ? 'engagement' then private.field_text(p_data, 'engagement', 30, true) else engagement end,
    company_name = case when p_data ? 'company_name' then coalesce(private.field_text(p_data, 'company_name', 160), '') else company_name end,
    user_id = case when p_data ? 'user_id' then linked else user_id end,
    status = coalesce(new_status, status),
    version = version + 1, updated_at = now()
  where id = p_operative returning version into next_version;
  return next_version;
end $$;

create function public.create_team(p_request_key uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); result uuid; kind_value text;
begin
  if not private.is_office() then raise exception 'Office permission required' using errcode='42501'; end if;
  perform private.only_keys(p_data, array['name','kind','contractor_name']);
  result := private.request_result(org, 'create_team', p_request_key, p_data);
  if result is not null then return result; end if;
  kind_value := private.field_text(p_data, 'kind', 30, true);
  perform private.assert_choice(kind_value, 'kind', array['subcontract_gang','individual_subcontractor','direct_team','mixed','temporary']);
  insert into public.teams(organisation_id, name, kind, contractor_name, created_by)
  values (org, private.field_text(p_data, 'name', 160, true), kind_value, coalesce(private.field_text(p_data, 'contractor_name', 160), ''), auth.uid())
  returning id into result;
  perform private.record_request(org, 'create_team', p_request_key, p_data, result);
  return result;
end $$;

create function public.update_team(p_team uuid, p_version integer, p_data jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare t public.teams; next_version integer;
begin
  select * into t from public.teams where id = p_team for update;
  if not found or t.organisation_id is distinct from private.current_org() or not private.is_office() then
    raise exception 'Office permission required' using errcode='42501';
  end if;
  perform private.only_keys(p_data, array['name','kind','contractor_name','active']);
  if t.version is distinct from p_version then raise exception 'Team changed; reload before saving' using errcode='40001'; end if;
  perform private.assert_choice(private.field_text(p_data, 'kind', 30), 'kind', array['subcontract_gang','individual_subcontractor','direct_team','mixed','temporary']);
  update public.teams set
    name = case when p_data ? 'name' then private.field_text(p_data, 'name', 160, true) else name end,
    kind = case when p_data ? 'kind' then private.field_text(p_data, 'kind', 30, true) else kind end,
    contractor_name = case when p_data ? 'contractor_name' then coalesce(private.field_text(p_data, 'contractor_name', 160), '') else contractor_name end,
    active = case when p_data ? 'active' then coalesce(private.field_boolean(p_data, 'active'), active) else active end,
    version = version + 1, updated_at = now()
  where id = p_team returning version into next_version;
  return next_version;
end $$;

-- Backdating is allowed (up to a year) so existing gangs can be recorded; the
-- row's created_at still shows when it was entered.
create function public.add_team_member(p_request_key uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); result uuid; team_ref uuid; operative_ref uuid; starts date;
begin
  if not private.is_office() then raise exception 'Office permission required' using errcode='42501'; end if;
  perform private.only_keys(p_data, array['team_id','operative_id','valid_from','is_lead']);
  result := private.request_result(org, 'add_team_member', p_request_key, p_data);
  if result is not null then return result; end if;
  team_ref := private.field_uuid(p_data, 'team_id', true);
  operative_ref := private.field_uuid(p_data, 'operative_id', true);
  starts := coalesce(private.field_date(p_data, 'valid_from'), private.site_today());
  if starts not between private.site_today() - 366 and private.site_today() + 366 then
    raise exception 'Membership must start within a year of today' using errcode='22023';
  end if;
  if not exists (select 1 from public.teams where id = team_ref and organisation_id = org and active) then
    raise exception 'Team not found or inactive' using errcode='23514';
  end if;
  if not exists (select 1 from public.operatives where id = operative_ref and organisation_id = org and status <> 'inactive') then
    raise exception 'Operative not found or inactive' using errcode='23514';
  end if;
  insert into public.team_memberships(organisation_id, team_id, operative_id, is_lead, valid_from, created_by)
  values (org, team_ref, operative_ref, coalesce(private.field_boolean(p_data, 'is_lead'), false), starts, auth.uid())
  returning id into result;
  perform private.record_request(org, 'add_team_member', p_request_key, p_data, result);
  return result;
end $$;

-- valid_until is the last day of membership, inclusive. Repeating the same end
-- date is a safe retry; a different one is refused rather than overwritten.
create function public.end_team_membership(p_membership uuid, p_valid_until date, p_reason text default null) returns void
language plpgsql security definer set search_path='' as $$
declare m public.team_memberships;
begin
  select * into m from public.team_memberships where id = p_membership for update;
  if not found or m.organisation_id is distinct from private.current_org() or not private.is_office() then
    raise exception 'Office permission required' using errcode='42501';
  end if;
  if m.voided_at is not null then raise exception 'This membership was voided' using errcode='23514'; end if;
  if m.valid_until is not null then
    if m.valid_until = p_valid_until then return; end if;
    raise exception 'This membership already ended on %', m.valid_until using errcode='23514';
  end if;
  if p_valid_until is null or p_valid_until < m.valid_from or p_valid_until > private.site_today() + 366 then
    raise exception 'The end date must be on or after the start date' using errcode='22023';
  end if;
  if p_reason is not null and length(p_reason) > 2000 then raise exception 'Reason exceeds 2000 characters' using errcode='22023'; end if;
  update public.team_memberships set valid_until = p_valid_until, ended_by = auth.uid(), end_reason = nullif(trim(p_reason), '')
  where id = p_membership;
end $$;

create function public.void_team_membership(p_membership uuid, p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare m public.team_memberships;
begin
  select * into m from public.team_memberships where id = p_membership for update;
  if not found or m.organisation_id is distinct from private.current_org() or not private.is_office() then
    raise exception 'Office permission required' using errcode='42501';
  end if;
  if m.voided_at is not null then return; end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then
    raise exception 'Record why this membership was entered in error' using errcode='22023';
  end if;
  update public.team_memberships set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_membership;
end $$;

revoke all on function private.is_office(), private.is_site_staff(), private.my_team_ids(), private.is_current_teammate(uuid),
  private.guard_append_only(), private.guard_team_membership(), private.assert_choice(text,text,text[]) from public, anon, authenticated;
grant execute on function private.is_office(), private.is_site_staff(), private.my_team_ids(), private.is_current_teammate(uuid) to authenticated;
revoke all on function public.create_operative(uuid,jsonb), public.update_operative(uuid,integer,jsonb), public.create_team(uuid,jsonb),
  public.update_team(uuid,integer,jsonb), public.add_team_member(uuid,jsonb), public.end_team_membership(uuid,date,text),
  public.void_team_membership(uuid,text) from public, anon;
grant execute on function public.create_operative(uuid,jsonb), public.update_operative(uuid,integer,jsonb), public.create_team(uuid,jsonb),
  public.update_team(uuid,integer,jsonb), public.add_team_member(uuid,jsonb), public.end_team_membership(uuid,date,text),
  public.void_team_membership(uuid,text) to authenticated;
commit;
