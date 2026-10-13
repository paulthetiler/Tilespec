-- Supervisor V2, Phase 1: planned and actual allocations, and work attribution.
-- The office plans which team works where. The supervisor records who was
-- actually there and when. Neither overwrites the other or its own history:
-- plans are revised by superseding; actual allocations are ended, moved, split
-- or voided, and the earlier row always remains. An allocation is evidence of
-- who was assigned to work at a location; it is never treated as proof of
-- fault for a defect.
begin;

do $$
begin
  if to_regclass('public.work_areas') is null or to_regclass('public.teams') is null or to_regclass('public.operatives') is null
    or to_regprocedure('private.guard_append_only()') is null or to_regprocedure('private.assert_choice(text,text,text[])') is null
    or to_regprocedure('private.field_uuids(jsonb,text,integer)') is null then
    raise exception 'Preflight failed: apply the locations and teams migrations first and review supabase/inspection/supervisor-v2-preflight.sql.';
  end if;
  if to_regclass('public.planned_allocations') is not null or to_regclass('public.actual_allocations') is not null
    or to_regclass('public.allocation_absences') is not null or to_regtype('public.installation_stage') is not null then
    raise exception 'Preflight failed: allocation objects already exist (schema drift). Review the preflight report before applying.';
  end if;
end $$;

create function private.installation_stages() returns text[] language sql immutable set search_path='' as $$
  select array['preparation','waterproofing','installation','grouting','sealant','protection','remedial']
$$;
create domain public.installation_stage as text check (value = any(private.installation_stages()));

create table public.planned_allocations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  contract_id uuid not null,
  work_area_id uuid not null,
  work_package_id uuid,
  team_id uuid not null,
  stage public.installation_stage not null,
  planned_start date not null,
  planned_end date not null,
  instructions text not null default '' check (length(instructions) <= 4000),
  supersedes_id uuid unique,
  superseded_by uuid unique,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancel_reason text check (cancel_reason is null or length(trim(cancel_reason)) between 5 and 2000),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organisation_id, contract_id, id),
  foreign key (organisation_id, contract_id, work_area_id) references public.work_areas(organisation_id, contract_id, id),
  foreign key (organisation_id, contract_id, work_package_id) references public.work_packages(organisation_id, contract_id, id),
  foreign key (organisation_id, team_id) references public.teams(organisation_id, id),
  foreign key (organisation_id, contract_id, supersedes_id) references public.planned_allocations(organisation_id, contract_id, id),
  foreign key (organisation_id, contract_id, superseded_by) references public.planned_allocations(organisation_id, contract_id, id),
  check (planned_end between planned_start and planned_start + 366),
  check ((cancelled_at is null) = (cancel_reason is null)),
  check (superseded_by is null or cancelled_at is null)
);
create table public.planned_allocation_operatives (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  contract_id uuid not null,
  planned_allocation_id uuid not null,
  operative_id uuid not null,
  created_at timestamptz not null default now(),
  unique (planned_allocation_id, operative_id),
  foreign key (organisation_id, contract_id, planned_allocation_id) references public.planned_allocations(organisation_id, contract_id, id),
  foreign key (organisation_id, operative_id) references public.operatives(organisation_id, id)
);
-- deviations are computed by the database from the plan, never accepted from
-- the client, and any deviation requires the supervisor's reason.
create table public.actual_allocations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  contract_id uuid not null,
  planned_allocation_id uuid,
  previous_allocation_id uuid,
  work_area_id uuid not null,
  work_package_id uuid,
  team_id uuid,
  stage public.installation_stage not null,
  work_date date not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  deviations text[] not null default '{}' check (deviations <@ array['unplanned','outside_planned_dates','location_changed',
    'team_changed','package_changed','stage_changed','operatives_changed']::text[]),
  deviation_reason text check (deviation_reason is null or length(trim(deviation_reason)) between 5 and 2000),
  confirmed_by uuid not null default auth.uid() references auth.users(id),
  recorded_at timestamptz not null default now(),
  ended_by uuid references auth.users(id),
  ended_recorded_at timestamptz,
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text check (void_reason is null or length(trim(void_reason)) between 5 and 2000),
  unique (organisation_id, contract_id, id),
  foreign key (organisation_id, contract_id, planned_allocation_id) references public.planned_allocations(organisation_id, contract_id, id),
  foreign key (organisation_id, contract_id, previous_allocation_id) references public.actual_allocations(organisation_id, contract_id, id),
  foreign key (organisation_id, contract_id, work_area_id) references public.work_areas(organisation_id, contract_id, id),
  foreign key (organisation_id, contract_id, work_package_id) references public.work_packages(organisation_id, contract_id, id),
  foreign key (organisation_id, team_id) references public.teams(organisation_id, id),
  check (ended_at is null or ended_at > started_at),
  check (cardinality(deviations) = 0 or deviation_reason is not null),
  check ((ended_at is null) = (ended_recorded_at is null)),
  check ((voided_at is null) = (void_reason is null))
);
-- Attendance is per person: a gang being planned never implies who was present.
create table public.actual_allocation_operatives (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  contract_id uuid not null,
  actual_allocation_id uuid not null,
  operative_id uuid not null,
  joined_at timestamptz not null,
  left_at timestamptz,
  note text check (note is null or length(trim(note)) between 5 and 2000),
  added_by uuid not null default auth.uid() references auth.users(id),
  recorded_at timestamptz not null default now(),
  left_recorded_by uuid references auth.users(id),
  left_recorded_at timestamptz,
  departure_note text check (departure_note is null or length(trim(departure_note)) between 1 and 2000),
  unique (actual_allocation_id, operative_id),
  foreign key (organisation_id, contract_id, actual_allocation_id) references public.actual_allocations(organisation_id, contract_id, id),
  foreign key (organisation_id, operative_id) references public.operatives(organisation_id, id),
  check (left_at is null or left_at > joined_at),
  check ((left_at is null) = (left_recorded_at is null))
);
-- A planned team (operative_id null) or a planned individual who did not attend.
create table public.allocation_absences (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  contract_id uuid not null,
  planned_allocation_id uuid not null,
  work_date date not null,
  operative_id uuid,
  reason text not null check (length(trim(reason)) between 5 and 2000),
  recorded_by uuid not null default auth.uid() references auth.users(id),
  recorded_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text check (void_reason is null or length(trim(void_reason)) between 5 and 2000),
  foreign key (organisation_id, contract_id, planned_allocation_id) references public.planned_allocations(organisation_id, contract_id, id),
  foreign key (organisation_id, operative_id) references public.operatives(organisation_id, id),
  check ((voided_at is null) = (void_reason is null))
);
create unique index allocation_absences_once on public.allocation_absences(planned_allocation_id, work_date,
  coalesce(operative_id, '00000000-0000-0000-0000-000000000000'::uuid)) where voided_at is null;
create index planned_allocations_current on public.planned_allocations(contract_id, planned_start, planned_end)
  where superseded_by is null and cancelled_at is null;
create index planned_allocations_team on public.planned_allocations(team_id, planned_start);
create index planned_allocation_operatives_operative on public.planned_allocation_operatives(operative_id);
create index actual_allocations_day on public.actual_allocations(contract_id, work_date);
create index actual_allocations_location on public.actual_allocations(work_area_id, started_at);
create index actual_allocations_plan on public.actual_allocations(planned_allocation_id, work_date);
create index actual_allocations_previous on public.actual_allocations(previous_allocation_id);
create index actual_allocation_operatives_operative on public.actual_allocation_operatives(operative_id, joined_at);
create index allocation_absences_day on public.allocation_absences(contract_id, work_date);

create trigger planned_allocation_append_only before update or delete on public.planned_allocations
  for each row execute function private.guard_append_only('superseded_by','cancelled_at','cancelled_by','cancel_reason');
create trigger planned_allocation_operative_append_only before update or delete on public.planned_allocation_operatives
  for each row execute function private.guard_append_only();
create trigger actual_allocation_append_only before update or delete on public.actual_allocations
  for each row execute function private.guard_append_only('ended_at','ended_by','ended_recorded_at','voided_at','voided_by','void_reason');
create trigger actual_allocation_operative_append_only before update or delete on public.actual_allocation_operatives
  for each row execute function private.guard_append_only('left_at','left_recorded_by','left_recorded_at','departure_note');
create trigger allocation_absence_append_only before update or delete on public.allocation_absences
  for each row execute function private.guard_append_only('voided_at','voided_by','void_reason');
create trigger audit_planned_allocation after insert or update on public.planned_allocations for each row execute function private.audit_mutation();
create trigger audit_planned_allocation_operative after insert on public.planned_allocation_operatives for each row execute function private.audit_mutation();
create trigger audit_actual_allocation after insert or update on public.actual_allocations for each row execute function private.audit_mutation();
create trigger audit_actual_allocation_operative after insert or update on public.actual_allocation_operatives for each row execute function private.audit_mutation();
create trigger audit_allocation_absence after insert or update on public.allocation_absences for each row execute function private.audit_mutation();

-- Owner, allocated contracts manager, or allocated supervisor (date-effective).
create function private.can_supervise_contract(p_contract uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.can_manage_contract(p_contract)
    or (coalesce(private.current_role() = 'supervisor', false) and private.can_access_contract(p_contract))
$$;
-- A package fits a location when one contains the other (a flat-wide package
-- covers its bathroom; a bathroom package sits within its flat).
create function private.on_location_branch(p_package uuid, p_area uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.work_packages p
    join public.work_areas pa on pa.id = p.work_area_id
    join public.work_areas t on t.id = p_area and t.contract_id = p.contract_id
    where p.id = p_package and (pa.id = any(t.path_ids) or t.id = any(pa.path_ids)))
$$;

alter table public.planned_allocations enable row level security;
alter table public.planned_allocation_operatives enable row level security;
alter table public.actual_allocations enable row level security;
alter table public.actual_allocation_operatives enable row level security;
alter table public.allocation_absences enable row level security;
-- Installers have no access in Phase 1; their view is designed with snags.
create policy planned_allocation_read on public.planned_allocations for select to authenticated using (private.can_supervise_contract(contract_id));
create policy planned_allocation_operative_read on public.planned_allocation_operatives for select to authenticated using (private.can_supervise_contract(contract_id));
create policy actual_allocation_read on public.actual_allocations for select to authenticated using (private.can_supervise_contract(contract_id));
create policy actual_allocation_operative_read on public.actual_allocation_operatives for select to authenticated using (private.can_supervise_contract(contract_id));
create policy allocation_absence_read on public.allocation_absences for select to authenticated using (private.can_supervise_contract(contract_id));
revoke all on public.planned_allocations, public.planned_allocation_operatives, public.actual_allocations,
  public.actual_allocation_operatives, public.allocation_absences from public, anon, authenticated;
grant select on public.planned_allocations, public.planned_allocation_operatives, public.actual_allocations,
  public.actual_allocation_operatives, public.allocation_absences to authenticated;

-- A location with open work or current plans cannot be archived out from under it.
create function private.guard_location_archive() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.archived_at is not null and old.archived_at is null then
    if exists (select 1 from public.actual_allocations a where a.work_area_id = new.id and a.voided_at is null and a.ended_at is null) then
      raise exception 'Location "%" has an open site allocation; end or move it before archiving', new.name using errcode='23514';
    end if;
    if exists (select 1 from public.planned_allocations p where p.work_area_id = new.id and p.superseded_by is null
      and p.cancelled_at is null and p.planned_end >= private.site_today()) then
      raise exception 'Location "%" has current or future planned work; cancel or revise it before archiving', new.name using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger location_archive_guard before update of archived_at on public.work_areas
  for each row execute function private.guard_location_archive();

-- Office plans. A revision supersedes the earlier plan, which stays on record.
create function public.plan_allocation(p_request_key uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); result uuid; contract_ref uuid; area public.work_areas; package_ref uuid; team_ref uuid;
  stage_value text; starts date; ends date; operative_refs uuid[]; previous_ref uuid; previous public.planned_allocations;
begin
  perform private.only_keys(p_data, array['contract_id','work_area_id','work_package_id','team_id','stage','planned_start',
    'planned_end','instructions','operative_ids','supersedes_id']);
  contract_ref := private.field_uuid(p_data, 'contract_id', true);
  if not private.can_manage_contract(contract_ref) then raise exception 'Only the office can plan work on this contract' using errcode='42501'; end if;
  result := private.request_result(org, 'plan_allocation', p_request_key, p_data);
  if result is not null then return result; end if;
  select * into area from public.work_areas where id = private.field_uuid(p_data, 'work_area_id', true) and contract_id = contract_ref;
  if not found then raise exception 'Location not found on this contract' using errcode='23503'; end if;
  if area.archived_at is not null then raise exception 'Location "%" is archived', area.name using errcode='23514'; end if;
  package_ref := private.field_uuid(p_data, 'work_package_id');
  if package_ref is not null and not private.on_location_branch(package_ref, area.id) then
    raise exception 'The work package does not belong to this location' using errcode='23514';
  end if;
  team_ref := private.field_uuid(p_data, 'team_id', true);
  if not exists (select 1 from public.teams where id = team_ref and organisation_id = org and active) then
    raise exception 'Team not found or inactive' using errcode='23514';
  end if;
  stage_value := private.field_text(p_data, 'stage', 30, true);
  perform private.assert_choice(stage_value, 'stage', private.installation_stages());
  starts := private.field_date(p_data, 'planned_start', true);
  ends := coalesce(private.field_date(p_data, 'planned_end'), starts);
  if ends < starts or ends > starts + 366 then raise exception 'Planned end must be on or after the start and within a year' using errcode='22023'; end if;
  operative_refs := private.field_uuids(p_data, 'operative_ids', 60);
  if exists (select 1 from unnest(operative_refs) o where not exists (
    select 1 from public.operatives x where x.id = o and x.organisation_id = org and x.status = 'active')) then
    raise exception 'Planned operatives must be confirmed, active operatives' using errcode='23514';
  end if;
  previous_ref := private.field_uuid(p_data, 'supersedes_id');
  if previous_ref is not null then
    select * into previous from public.planned_allocations where id = previous_ref and contract_id = contract_ref for update;
    if not found then raise exception 'The plan being revised was not found on this contract' using errcode='23503'; end if;
    if previous.superseded_by is not null or previous.cancelled_at is not null then
      raise exception 'That plan has already been revised or cancelled; reload the current plan' using errcode='40001';
    end if;
  end if;
  insert into public.planned_allocations(organisation_id, contract_id, work_area_id, work_package_id, team_id, stage,
    planned_start, planned_end, instructions, supersedes_id, created_by)
  values (org, contract_ref, area.id, package_ref, team_ref, stage_value, starts, ends,
    coalesce(private.field_text(p_data, 'instructions', 4000), ''), previous_ref, auth.uid())
  returning id into result;
  insert into public.planned_allocation_operatives(organisation_id, contract_id, planned_allocation_id, operative_id)
  select org, contract_ref, result, o from unnest(operative_refs) o;
  if previous_ref is not null then update public.planned_allocations set superseded_by = result where id = previous_ref; end if;
  perform private.record_request(org, 'plan_allocation', p_request_key, p_data, result);
  return result;
end $$;

create function public.cancel_planned_allocation(p_plan uuid, p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare plan public.planned_allocations;
begin
  select * into plan from public.planned_allocations where id = p_plan for update;
  if not found or not private.can_manage_contract(plan.contract_id) then raise exception 'Only the office can cancel planned work' using errcode='42501'; end if;
  if plan.cancelled_at is not null then return; end if;
  if plan.superseded_by is not null then raise exception 'This plan was revised; cancel the current revision instead' using errcode='23514'; end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then
    raise exception 'Record why this planned work is cancelled' using errcode='22023';
  end if;
  update public.planned_allocations set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(p_reason) where id = p_plan;
end $$;

-- Nobody can be recorded in two places at once. Locks are taken in a fixed
-- order so concurrent confirmations cannot deadlock.
create function private.assert_operatives_free(p_contract uuid, p_operatives uuid[], p_from timestamptz, p_until timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare operative uuid; clash record;
begin
  for operative in select o from unnest(p_operatives) o order by o loop
    perform pg_advisory_xact_lock(hashtextextended('tilespec-operative:' || operative::text, 0));
  end loop;
  select x.display_name, w.name as area_name, a.contract_id, ao.joined_at into clash
  from public.actual_allocation_operatives ao
    join public.actual_allocations a on a.id = ao.actual_allocation_id
    join public.operatives x on x.id = ao.operative_id
    join public.work_areas w on w.id = a.work_area_id
  where ao.operative_id = any(p_operatives) and a.voided_at is null
    and tstzrange(ao.joined_at, coalesce(ao.left_at, a.ended_at), '[)') && tstzrange(p_from, p_until, '[)')
  order by ao.joined_at limit 1;
  if found then
    if clash.contract_id = p_contract then
      raise exception '% is already recorded at % from %; end or move that allocation first', clash.display_name, clash.area_name,
        to_char(clash.joined_at at time zone 'Europe/London', 'DD Mon HH24:MI') using errcode='23P01';
    end if;
    raise exception '% is already recorded on another site for this time', clash.display_name using errcode='23P01';
  end if;
end $$;

create function private.insert_actual_allocation(p_contract uuid, p_plan uuid, p_area uuid, p_package uuid, p_team uuid, p_stage text,
  p_operatives uuid[], p_started timestamptz, p_ended timestamptz, p_reason text, p_previous uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); area public.work_areas; plan public.planned_allocations;
  found_deviations text[] := '{}'; planned_operatives uuid[]; work_day date; result uuid;
begin
  select * into area from public.work_areas where id = p_area and contract_id = p_contract;
  if not found then raise exception 'Location not found on this contract' using errcode='23503'; end if;
  if area.archived_at is not null then raise exception 'Location "%" is archived', area.name using errcode='23514'; end if;
  if p_package is not null and not private.on_location_branch(p_package, p_area) then
    raise exception 'The work package does not belong to this location' using errcode='23514';
  end if;
  if p_team is not null and not exists (select 1 from public.teams where id = p_team and organisation_id = org and active) then
    raise exception 'Team not found or inactive' using errcode='23514';
  end if;
  if p_stage is null then raise exception 'Missing required field: stage' using errcode='22023'; end if;
  perform private.assert_choice(p_stage, 'stage', private.installation_stages());
  if coalesce(cardinality(p_operatives), 0) = 0 then raise exception 'Confirm at least one operative who is actually present' using errcode='22023'; end if;
  if exists (select 1 from unnest(p_operatives) o where not exists (
    select 1 from public.operatives x where x.id = o and x.organisation_id = org and x.status in ('active','provisional'))) then
    raise exception 'Every operative must be registered and not inactive' using errcode='23514';
  end if;
  if p_started > now() + interval '5 minutes' or p_started < now() - interval '31 days' then
    raise exception 'Start time must be within the last 31 days and not in the future' using errcode='22023';
  end if;
  if p_ended is not null and (p_ended <= p_started or p_ended > now() + interval '5 minutes') then
    raise exception 'End time must follow the start time and not be in the future' using errcode='22023';
  end if;
  work_day := (p_started at time zone 'Europe/London')::date;

  if p_plan is null then
    found_deviations := array['unplanned'];
  else
    select * into plan from public.planned_allocations where id = p_plan and contract_id = p_contract;
    if not found then raise exception 'Planned allocation not found on this contract' using errcode='23503'; end if;
    if plan.superseded_by is not null or plan.cancelled_at is not null then
      raise exception 'The office has revised or cancelled this plan; reload today''s plan' using errcode='40001';
    end if;
    if work_day not between plan.planned_start and plan.planned_end then found_deviations := found_deviations || 'outside_planned_dates'::text; end if;
    if not (plan.work_area_id = any(area.path_ids)) then found_deviations := found_deviations || 'location_changed'::text; end if;
    if p_team is distinct from plan.team_id then found_deviations := found_deviations || 'team_changed'::text; end if;
    if plan.work_package_id is not null and p_package is distinct from plan.work_package_id then found_deviations := found_deviations || 'package_changed'::text; end if;
    if p_stage is distinct from plan.stage::text then found_deviations := found_deviations || 'stage_changed'::text; end if;
    select coalesce(array_agg(operative_id order by operative_id), '{}') into planned_operatives
      from public.planned_allocation_operatives where planned_allocation_id = plan.id;
    if cardinality(planned_operatives) > 0 and planned_operatives <> (select array_agg(o order by o) from unnest(p_operatives) o) then
      found_deviations := found_deviations || 'operatives_changed'::text;
    end if;
  end if;
  if cardinality(found_deviations) > 0 and (p_reason is null or length(trim(p_reason)) < 5) then
    raise exception 'Record why this differs from the office plan (%)', array_to_string(found_deviations, ', ') using errcode='22023';
  end if;
  if p_reason is not null and length(trim(p_reason)) > 2000 then raise exception 'Reason exceeds 2000 characters' using errcode='22023'; end if;
  perform private.assert_operatives_free(p_contract, p_operatives, p_started, p_ended);

  insert into public.actual_allocations(organisation_id, contract_id, planned_allocation_id, previous_allocation_id, work_area_id,
    work_package_id, team_id, stage, work_date, started_at, ended_at, ended_by, ended_recorded_at, deviations, deviation_reason, confirmed_by)
  values (org, p_contract, p_plan, p_previous, p_area, p_package, p_team, p_stage, work_day, p_started, p_ended,
    case when p_ended is not null then auth.uid() end, case when p_ended is not null then now() end,
    found_deviations, nullif(trim(p_reason), ''), auth.uid())
  returning id into result;
  insert into public.actual_allocation_operatives(organisation_id, contract_id, actual_allocation_id, operative_id, joined_at, added_by)
  select org, p_contract, result, o, p_started, auth.uid() from unnest(p_operatives) o;
  return result;
end $$;

-- Supervisor confirms who is actually working where. Fields omitted are taken
-- from the plan; anything that then differs from it needs a reason.
create function public.record_actual_allocation(p_request_key uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); result uuid; contract_ref uuid; plan_ref uuid; plan public.planned_allocations;
begin
  perform private.only_keys(p_data, array['contract_id','planned_allocation_id','work_area_id','work_package_id','team_id','stage',
    'operative_ids','started_at','ended_at','reason']);
  contract_ref := private.field_uuid(p_data, 'contract_id', true);
  if not private.can_supervise_contract(contract_ref) then raise exception 'Site supervision permission required for this contract' using errcode='42501'; end if;
  result := private.request_result(org, 'record_actual_allocation', p_request_key, p_data);
  if result is not null then return result; end if;
  plan_ref := private.field_uuid(p_data, 'planned_allocation_id');
  if plan_ref is not null then
    select * into plan from public.planned_allocations where id = plan_ref and contract_id = contract_ref;
    if not found then raise exception 'Planned allocation not found on this contract' using errcode='23503'; end if;
  end if;
  result := private.insert_actual_allocation(contract_ref, plan_ref,
    coalesce(case when p_data ? 'work_area_id' then private.field_uuid(p_data, 'work_area_id') else plan.work_area_id end,
      private.field_uuid(p_data, 'work_area_id', true)),
    case when p_data ? 'work_package_id' then private.field_uuid(p_data, 'work_package_id') else plan.work_package_id end,
    case when p_data ? 'team_id' then private.field_uuid(p_data, 'team_id') else plan.team_id end,
    case when p_data ? 'stage' then private.field_text(p_data, 'stage', 30) else plan.stage end,
    private.field_uuids(p_data, 'operative_ids', 60),
    coalesce(private.field_timestamp(p_data, 'started_at'), now()),
    private.field_timestamp(p_data, 'ended_at'),
    private.field_text(p_data, 'reason', 2000), null);
  perform private.record_request(org, 'record_actual_allocation', p_request_key, p_data, result);
  return result;
end $$;

-- Repeating the same end (or "end now") after success is a safe retry.
create function public.end_actual_allocation(p_allocation uuid, p_ended_at timestamptz default null) returns void
language plpgsql security definer set search_path='' as $$
declare a public.actual_allocations; ending timestamptz;
begin
  select * into a from public.actual_allocations where id = p_allocation for update;
  if not found or not private.can_supervise_contract(a.contract_id) then raise exception 'Site supervision permission required' using errcode='42501'; end if;
  if a.voided_at is not null then raise exception 'This allocation was voided' using errcode='23514'; end if;
  if a.ended_at is not null then
    if p_ended_at is null or p_ended_at = a.ended_at then return; end if;
    raise exception 'This allocation already ended at %', to_char(a.ended_at at time zone 'Europe/London', 'DD Mon HH24:MI') using errcode='23514';
  end if;
  ending := coalesce(p_ended_at, now());
  if ending <= a.started_at or ending > now() + interval '5 minutes' then
    raise exception 'End time must follow the start time and not be in the future' using errcode='22023';
  end if;
  if exists (select 1 from public.actual_allocation_operatives where actual_allocation_id = a.id and (joined_at >= ending or left_at > ending)) then
    raise exception 'An operative''s recorded times fall after this end time' using errcode='23514';
  end if;
  update public.actual_allocations set ended_at = ending, ended_by = auth.uid(), ended_recorded_at = now() where id = p_allocation;
end $$;

-- Move or split a gang during the day: the current allocation ends at the
-- given time and one or more new allocations start then, atomically, each
-- linked back to it. Operatives not sent anywhere are treated as leaving.
create function public.reallocate_actual_allocation(p_request_key uuid, p_allocation uuid, p_data jsonb) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); source public.actual_allocations; prior uuid; at_time timestamptz; present uuid[];
  target jsonb; target_operatives uuid[]; assigned uuid[] := '{}'; area_ref uuid; plan_ref uuid; results uuid[] := '{}'; created uuid;
begin
  select * into source from public.actual_allocations where id = p_allocation for update;
  if not found or not private.can_supervise_contract(source.contract_id) then raise exception 'Site supervision permission required' using errcode='42501'; end if;
  perform private.only_keys(p_data, array['at','reason','targets']);
  prior := private.request_result(org, 'reallocate_actual_allocation', p_request_key, jsonb_build_object('allocation', p_allocation, 'data', p_data));
  if prior is not null then
    return array(select id from public.actual_allocations where previous_allocation_id = prior order by recorded_at, id);
  end if;
  if source.voided_at is not null or source.ended_at is not null then
    raise exception 'This allocation has already ended; record a new allocation instead' using errcode='23514';
  end if;
  at_time := coalesce(private.field_timestamp(p_data, 'at'), now());
  if at_time <= source.started_at or at_time > now() + interval '5 minutes' then
    raise exception 'The change time must follow the start and not be in the future' using errcode='22023';
  end if;
  if exists (select 1 from public.actual_allocation_operatives where actual_allocation_id = source.id and (joined_at >= at_time or left_at > at_time)) then
    raise exception 'An operative''s recorded times fall after this change time' using errcode='23514';
  end if;
  select coalesce(array_agg(operative_id order by operative_id), '{}') into present from public.actual_allocation_operatives
    where actual_allocation_id = source.id and joined_at < at_time and (left_at is null or left_at > at_time);
  if jsonb_typeof(p_data->'targets') is distinct from 'array' or jsonb_array_length(p_data->'targets') not between 1 and 10 then
    raise exception 'Provide between 1 and 10 destinations' using errcode='22023';
  end if;
  for target in select value from jsonb_array_elements(p_data->'targets') loop
    perform private.only_keys(target, array['work_area_id','work_package_id','team_id','stage','operative_ids']);
    target_operatives := private.field_uuids(target, 'operative_ids', 60);
    if cardinality(target_operatives) = 0 then
      if jsonb_array_length(p_data->'targets') > 1 then raise exception 'When splitting a gang, list who goes to each location' using errcode='22023'; end if;
      target_operatives := present;
    end if;
    if not (target_operatives <@ present) then
      raise exception 'Only operatives present on this allocation can be moved' using errcode='23514';
    end if;
    if target_operatives && assigned then raise exception 'An operative cannot be sent to two places at once' using errcode='22023'; end if;
    assigned := assigned || target_operatives;
  end loop;

  update public.actual_allocations set ended_at = at_time, ended_by = auth.uid(), ended_recorded_at = now() where id = source.id;
  plan_ref := (select p.id from public.planned_allocations p where p.id = source.planned_allocation_id and p.superseded_by is null and p.cancelled_at is null);
  for target in select value from jsonb_array_elements(p_data->'targets') loop
    area_ref := private.field_uuid(target, 'work_area_id', true);
    target_operatives := private.field_uuids(target, 'operative_ids', 60);
    if cardinality(target_operatives) = 0 then target_operatives := present; end if;
    created := private.insert_actual_allocation(source.contract_id, plan_ref, area_ref,
      case when target ? 'work_package_id' then private.field_uuid(target, 'work_package_id')
        when source.work_package_id is not null and private.on_location_branch(source.work_package_id, area_ref) then source.work_package_id end,
      case when target ? 'team_id' then private.field_uuid(target, 'team_id') else source.team_id end,
      case when target ? 'stage' then private.field_text(target, 'stage', 30) else source.stage end,
      target_operatives, at_time, null, private.field_text(p_data, 'reason', 2000), source.id);
    results := results || created;
  end loop;
  perform private.record_request(org, 'reallocate_actual_allocation', p_request_key,
    jsonb_build_object('allocation', p_allocation, 'data', p_data), source.id);
  return results;
end $$;

-- A replacement or late arrival joins an open allocation, with a note why.
create function public.add_allocation_operative(p_allocation uuid, p_operative uuid, p_joined_at timestamptz, p_note text) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.actual_allocations; existing public.actual_allocation_operatives; joining timestamptz; result uuid;
begin
  select * into a from public.actual_allocations where id = p_allocation for update;
  if not found or not private.can_supervise_contract(a.contract_id) then raise exception 'Site supervision permission required' using errcode='42501'; end if;
  select * into existing from public.actual_allocation_operatives where actual_allocation_id = a.id and operative_id = p_operative;
  if found then
    if p_joined_at is null or p_joined_at = existing.joined_at then return existing.id; end if;
    raise exception 'This operative is already on this allocation' using errcode='23514';
  end if;
  if a.voided_at is not null or a.ended_at is not null then raise exception 'This allocation has ended; record a new allocation instead' using errcode='23514'; end if;
  if p_note is null or length(trim(p_note)) not between 5 and 2000 then
    raise exception 'Record why this operative joined (for example, replacement for an absent operative)' using errcode='22023';
  end if;
  joining := coalesce(p_joined_at, now());
  if joining < a.started_at or joining > now() + interval '5 minutes' then
    raise exception 'Joining time must be within the allocation and not in the future' using errcode='22023';
  end if;
  if not exists (select 1 from public.operatives where id = p_operative and organisation_id = a.organisation_id and status in ('active','provisional')) then
    raise exception 'Every operative must be registered and not inactive' using errcode='23514';
  end if;
  perform private.assert_operatives_free(a.contract_id, array[p_operative], joining, null);
  insert into public.actual_allocation_operatives(organisation_id, contract_id, actual_allocation_id, operative_id, joined_at, note, added_by)
  values (a.organisation_id, a.contract_id, a.id, p_operative, joining, trim(p_note), auth.uid()) returning id into result;
  return result;
end $$;

create function public.record_operative_departure(p_allocation uuid, p_operative uuid, p_left_at timestamptz default null, p_note text default null)
returns void language plpgsql security definer set search_path='' as $$
declare a public.actual_allocations; row_ref public.actual_allocation_operatives; leaving timestamptz;
begin
  select * into a from public.actual_allocations where id = p_allocation for update;
  if not found or not private.can_supervise_contract(a.contract_id) then raise exception 'Site supervision permission required' using errcode='42501'; end if;
  if a.voided_at is not null then raise exception 'This allocation was voided' using errcode='23514'; end if;
  select * into row_ref from public.actual_allocation_operatives where actual_allocation_id = a.id and operative_id = p_operative for update;
  if not found then raise exception 'This operative is not on this allocation' using errcode='23503'; end if;
  if row_ref.left_at is not null then
    if p_left_at is null or p_left_at = row_ref.left_at then return; end if;
    raise exception 'Departure was already recorded at %', to_char(row_ref.left_at at time zone 'Europe/London', 'DD Mon HH24:MI') using errcode='23514';
  end if;
  leaving := coalesce(p_left_at, now());
  if leaving <= row_ref.joined_at or leaving > coalesce(a.ended_at, now() + interval '5 minutes') then
    raise exception 'Departure must follow arrival and fall within the allocation' using errcode='22023';
  end if;
  if p_note is not null and length(p_note) > 2000 then raise exception 'Note exceeds 2000 characters' using errcode='22023'; end if;
  update public.actual_allocation_operatives set left_at = leaving, left_recorded_by = auth.uid(), left_recorded_at = now(),
    departure_note = nullif(trim(p_note), '') where id = row_ref.id;
end $$;

-- For a record made in error. The voided row stays visible with who and why;
-- only its author or the office may void it.
create function public.void_actual_allocation(p_allocation uuid, p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.actual_allocations;
begin
  select * into a from public.actual_allocations where id = p_allocation for update;
  if not found or not private.can_supervise_contract(a.contract_id)
    or not (a.confirmed_by = auth.uid() or private.can_manage_contract(a.contract_id)) then
    raise exception 'Only the confirming supervisor or the office can void this record' using errcode='42501';
  end if;
  if a.voided_at is not null then return; end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then
    raise exception 'Record why this allocation was entered in error' using errcode='22023';
  end if;
  update public.actual_allocations set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_allocation;
end $$;

-- A planned team, or one planned person, did not attend. Contradicting a
-- confirmed attendance for the same day is refused rather than silently kept.
create function public.record_allocation_absence(p_request_key uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); result uuid; plan public.planned_allocations; absent_on date; operative_ref uuid;
begin
  perform private.only_keys(p_data, array['planned_allocation_id','work_date','operative_id','reason']);
  select * into plan from public.planned_allocations where id = private.field_uuid(p_data, 'planned_allocation_id', true);
  if not found or not private.can_supervise_contract(plan.contract_id) then raise exception 'Site supervision permission required' using errcode='42501'; end if;
  result := private.request_result(org, 'record_allocation_absence', p_request_key, p_data);
  if result is not null then return result; end if;
  if plan.superseded_by is not null or plan.cancelled_at is not null then
    raise exception 'The office has revised or cancelled this plan; reload today''s plan' using errcode='40001';
  end if;
  absent_on := coalesce(private.field_date(p_data, 'work_date'), private.site_today());
  if absent_on not between plan.planned_start and plan.planned_end or absent_on > private.site_today() then
    raise exception 'Absence must be for a planned day that is not in the future' using errcode='22023';
  end if;
  operative_ref := private.field_uuid(p_data, 'operative_id');
  if operative_ref is null then
    if exists (select 1 from public.actual_allocations where planned_allocation_id = plan.id and work_date = absent_on and voided_at is null) then
      raise exception 'This team is already recorded on site that day; void or end that record instead' using errcode='23514';
    end if;
  else
    if not exists (select 1 from public.planned_allocation_operatives where planned_allocation_id = plan.id and operative_id = operative_ref)
      and not exists (select 1 from public.team_memberships m where m.team_id = plan.team_id and m.operative_id = operative_ref
        and m.voided_at is null and absent_on between m.valid_from and coalesce(m.valid_until, absent_on)) then
      raise exception 'This operative was not planned for this work or a member of the planned team' using errcode='23514';
    end if;
    if exists (select 1 from public.actual_allocation_operatives ao join public.actual_allocations a on a.id = ao.actual_allocation_id
      where ao.operative_id = operative_ref and a.contract_id = plan.contract_id and a.work_date = absent_on and a.voided_at is null) then
      raise exception 'This operative is already recorded on site that day' using errcode='23514';
    end if;
  end if;
  insert into public.allocation_absences(organisation_id, contract_id, planned_allocation_id, work_date, operative_id, reason, recorded_by)
  values (org, plan.contract_id, plan.id, absent_on, operative_ref, private.field_text(p_data, 'reason', 2000, true), auth.uid())
  returning id into result;
  perform private.record_request(org, 'record_allocation_absence', p_request_key, p_data, result);
  return result;
end $$;

create function public.void_allocation_absence(p_absence uuid, p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare absence public.allocation_absences;
begin
  select * into absence from public.allocation_absences where id = p_absence for update;
  if not found or not private.can_supervise_contract(absence.contract_id) then raise exception 'Site supervision permission required' using errcode='42501'; end if;
  if absence.voided_at is not null then return; end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then
    raise exception 'Record why this absence was entered in error' using errcode='22023';
  end if;
  update public.allocation_absences set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_absence;
end $$;

-- Who was recorded working at, around or within a location during a period.
-- Matches the location itself, anything containing it (a flat-wide allocation
-- covers its bathroom) and anything within it. Voided records are excluded.
-- Results are candidates with evidence for a person to weigh; they are not a
-- finding of responsibility. Runs with the caller's own row-level security.
create function public.location_work_history(p_area uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table (actual_allocation_id uuid, work_area_id uuid, location_relation text, team_id uuid, team_name text,
  contractor_name text, team_lead text, stage text, work_date date, started_at timestamptz, ended_at timestamptz,
  planned_allocation_id uuid, deviations text[], deviation_reason text, confirmed_by uuid, operative_ids uuid[], operative_names text[])
language sql stable security invoker set search_path='' as $$
  select a.id, a.work_area_id,
    case when a.work_area_id = target.id then 'exact' when a.work_area_id = any(target.path_ids) then 'containing' else 'within' end,
    a.team_id, t.name, t.contractor_name,
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
  where target.id = p_area and a.voided_at is null
    and (p_to is null or a.started_at < p_to)
    and (p_from is null or a.ended_at is null or a.ended_at > p_from)
  order by a.started_at desc, a.id
$$;

revoke all on function private.installation_stages(), private.can_supervise_contract(uuid), private.on_location_branch(uuid,uuid),
  private.guard_location_archive(), private.assert_operatives_free(uuid,uuid[],timestamptz,timestamptz),
  private.insert_actual_allocation(uuid,uuid,uuid,uuid,uuid,text,uuid[],timestamptz,timestamptz,text,uuid) from public, anon, authenticated;
grant execute on function private.can_supervise_contract(uuid), private.installation_stages() to authenticated;
revoke all on function public.plan_allocation(uuid,jsonb), public.cancel_planned_allocation(uuid,text), public.record_actual_allocation(uuid,jsonb),
  public.end_actual_allocation(uuid,timestamptz), public.reallocate_actual_allocation(uuid,uuid,jsonb),
  public.add_allocation_operative(uuid,uuid,timestamptz,text), public.record_operative_departure(uuid,uuid,timestamptz,text),
  public.void_actual_allocation(uuid,text), public.record_allocation_absence(uuid,jsonb), public.void_allocation_absence(uuid,text),
  public.location_work_history(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.plan_allocation(uuid,jsonb), public.cancel_planned_allocation(uuid,text), public.record_actual_allocation(uuid,jsonb),
  public.end_actual_allocation(uuid,timestamptz), public.reallocate_actual_allocation(uuid,uuid,jsonb),
  public.add_allocation_operative(uuid,uuid,timestamptz,text), public.record_operative_departure(uuid,uuid,timestamptz,text),
  public.void_actual_allocation(uuid,text), public.record_allocation_absence(uuid,jsonb), public.void_allocation_absence(uuid,text),
  public.location_work_history(uuid,timestamptz,timestamptz) to authenticated;
commit;
