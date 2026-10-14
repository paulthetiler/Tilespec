-- Supervisor V2, Phase 2B: the supervisor's daily workforce confirmation.
-- Builds on the Phase 1 allocation records; nothing here replaces them.
-- * An acting lead can be recorded for each period of work.
-- * A planned team is confirmed in one step: who is here (in one place or
--   split between several), who is absent and why. A plan is confirmed once a
--   day; later changes are moves, arrivals and departures, which keep history.
-- * Records never contradict each other: recording someone on site voids an
--   absence recorded for them that day (kept, with the time they arrived).
-- * All of a day's open work can be finished in one step.
-- * Supervisors can see the names of the people who recorded allocations on
--   their contract, without reading the rest of the member directory.
-- Additive: one column, new functions, and same-signature replacements that
-- keep every Phase 1 rule.
begin;

do $$
begin
  if to_regclass('public.actual_allocations') is null or to_regclass('public.subcontractor_companies') is null
    or to_regprocedure('private.insert_actual_allocation(uuid,uuid,uuid,uuid,uuid,text,uuid[],timestamptz,timestamptz,text,uuid)') is null
    or to_regprocedure('public.record_actual_allocation(uuid,jsonb)') is null
    or to_regprocedure('public.reallocate_actual_allocation(uuid,uuid,jsonb)') is null
    or to_regprocedure('public.add_allocation_operative(uuid,uuid,timestamptz,text)') is null then
    raise exception 'Preflight failed: apply 20261014100000_subcontractor_companies.sql first.';
  end if;
  if exists (select 1 from pg_attribute where attrelid = 'public.actual_allocations'::regclass and attname = 'lead_operative_id' and not attisdropped)
    or to_regprocedure('public.confirm_planned_allocation(uuid,jsonb)') is not null
    or to_regprocedure('private.clear_contradicted_absences(uuid,date,uuid,uuid[],timestamptz)') is not null then
    raise exception 'Preflight failed: daily workforce objects already exist (schema drift). Review before applying.';
  end if;
end $$;

-- The acting lead for this period of work, recorded once. To record a different
-- lead, the gang is moved: a new period starts and the earlier one is kept.
alter table public.actual_allocations add column lead_operative_id uuid,
  add constraint actual_allocations_lead foreign key (organisation_id, lead_operative_id) references public.operatives(organisation_id, id);
drop trigger actual_allocation_append_only on public.actual_allocations;
create trigger actual_allocation_append_only before update or delete on public.actual_allocations
  for each row execute function private.guard_append_only('ended_at','ended_by','ended_recorded_at','voided_at','voided_by','void_reason','lead_operative_id');
create function private.guard_allocation_lead() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.lead_operative_id is not null and not exists (select 1 from public.actual_allocation_operatives
    where actual_allocation_id = new.id and operative_id = new.lead_operative_id) then
    raise exception 'The acting lead must be one of the operatives on this work' using errcode='23514';
  end if;
  return new;
end $$;
create trigger actual_allocation_lead_guard before update of lead_operative_id on public.actual_allocations
  for each row execute function private.guard_allocation_lead();

create function private.apply_allocation_lead(p_allocation uuid, p_operative uuid) returns void
language plpgsql security definer set search_path='' as $$
declare current_lead uuid;
begin
  if p_operative is null then return; end if;
  select lead_operative_id into current_lead from public.actual_allocations where id = p_allocation for update;
  if current_lead = p_operative then return; end if;
  if current_lead is not null then
    raise exception 'An acting lead is already recorded for this work; move the gang to start a period with a different lead' using errcode='23514';
  end if;
  update public.actual_allocations set lead_operative_id = p_operative where id = p_allocation;
end $$;

-- Recording people on site contradicts an absence recorded for them on that
-- site that day, and recording a planned team contradicts "team not on site".
-- Those absences are voided, never deleted, with the time of arrival.
create function private.clear_contradicted_absences(p_contract uuid, p_day date, p_plan uuid, p_operatives uuid[], p_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.allocation_absences set voided_at = now(), voided_by = auth.uid(),
    void_reason = 'Recorded on site at ' || to_char(p_at at time zone 'Europe/London', 'HH24:MI')
  where contract_id = p_contract and work_date = p_day and voided_at is null
    and (operative_id = any(p_operatives) or (operative_id is null and p_plan is not null and planned_allocation_id = p_plan));
end $$;

-- Phase 1 body, unchanged except that it clears contradicted absences and
-- names any differences from the plan in plain words.
create or replace function private.insert_actual_allocation(p_contract uuid, p_plan uuid, p_area uuid, p_package uuid, p_team uuid, p_stage text,
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
    raise exception 'Record why this differs from the office plan (%)', (select string_agg(case d
      when 'unplanned' then 'not on the plan' when 'outside_planned_dates' then 'outside the planned dates'
      when 'location_changed' then 'different location' when 'team_changed' then 'different team'
      when 'package_changed' then 'different work package' when 'stage_changed' then 'different stage'
      else 'different operatives' end, ', ') from unnest(found_deviations) d) using errcode='22023';
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
  perform private.clear_contradicted_absences(p_contract, work_day, p_plan, p_operatives, p_started);
  return result;
end $$;

-- Phase 1 body, plus an optional acting lead.
create or replace function public.record_actual_allocation(p_request_key uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); result uuid; contract_ref uuid; plan_ref uuid; plan public.planned_allocations;
begin
  perform private.only_keys(p_data, array['contract_id','planned_allocation_id','work_area_id','work_package_id','team_id','stage',
    'operative_ids','started_at','ended_at','reason','lead_operative_id']);
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
  perform private.apply_allocation_lead(result, private.field_uuid(p_data, 'lead_operative_id'));
  perform private.record_request(org, 'record_actual_allocation', p_request_key, p_data, result);
  return result;
end $$;

-- Phase 1 body, plus an optional acting lead for each destination.
create or replace function public.reallocate_actual_allocation(p_request_key uuid, p_allocation uuid, p_data jsonb) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); source public.actual_allocations; prior uuid; at_time timestamptz; present uuid[];
  target jsonb; target_operatives uuid[]; assigned uuid[] := '{}'; area_ref uuid; plan_ref uuid; results uuid[] := '{}'; created uuid; lead_ref uuid;
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
    perform private.only_keys(target, array['work_area_id','work_package_id','team_id','stage','operative_ids','lead_operative_id']);
    target_operatives := private.field_uuids(target, 'operative_ids', 60);
    if cardinality(target_operatives) = 0 then
      if jsonb_array_length(p_data->'targets') > 1 then raise exception 'When splitting a gang, list who goes to each location' using errcode='22023'; end if;
      target_operatives := present;
    end if;
    if not (target_operatives <@ present) then
      raise exception 'Only operatives present on this allocation can be moved' using errcode='23514';
    end if;
    if target_operatives && assigned then raise exception 'An operative cannot be sent to two places at once' using errcode='22023'; end if;
    lead_ref := private.field_uuid(target, 'lead_operative_id');
    if lead_ref is not null and not (lead_ref = any(target_operatives)) then
      raise exception 'The acting lead must be one of the operatives sent to that location' using errcode='22023';
    end if;
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
    perform private.apply_allocation_lead(created, private.field_uuid(target, 'lead_operative_id'));
    results := results || created;
  end loop;
  perform private.record_request(org, 'reallocate_actual_allocation', p_request_key,
    jsonb_build_object('allocation', p_allocation, 'data', p_data), source.id);
  return results;
end $$;

-- Phase 1 body, unchanged except that an arrival clears a contradicted absence.
create or replace function public.add_allocation_operative(p_allocation uuid, p_operative uuid, p_joined_at timestamptz, p_note text) returns uuid
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
  perform private.clear_contradicted_absences(a.contract_id, a.work_date, a.planned_allocation_id, array[p_operative], joining);
  return result;
end $$;

-- The supervisor confirms a planned team for the day in one step: who is
-- here, in one place or split between several, and who is absent and why.
-- Fields left out are taken from the plan. A plan is confirmed once a day;
-- after that the gang is moved, joined or left, so every period is kept.
-- When the only difference from the plan is that named operatives are absent,
-- their absence reasons are the reason; anything else needs the supervisor's.
create function public.confirm_planned_allocation(p_request_key uuid, p_data jsonb) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); contract_ref uuid; plan public.planned_allocations; prior uuid; starts timestamptz; work_day date;
  entry jsonb; absent_ref uuid; absent_refs uuid[] := '{}'; group_count integer; group_operatives uuid[]; assigned uuid[] := '{}';
  planned uuid[]; caller_reason text; derived text; area_ref uuid; stage_value text; lead_ref uuid; created uuid; results uuid[] := '{}';
  existing public.actual_allocations; actor text; plain boolean := true;
begin
  perform private.only_keys(p_data, array['contract_id','planned_allocation_id','started_at','reason','groups','absent']);
  contract_ref := private.field_uuid(p_data, 'contract_id', true);
  if not private.can_supervise_contract(contract_ref) then raise exception 'Site supervision permission required for this contract' using errcode='42501'; end if;
  prior := private.request_result(org, 'confirm_planned_allocation', p_request_key, p_data);
  if prior is not null then
    -- Every allocation from that confirmation shares its transaction time.
    return array(select a.id from public.actual_allocations a join public.actual_allocations first on first.id = prior
      where a.planned_allocation_id = first.planned_allocation_id and a.recorded_at = first.recorded_at and a.previous_allocation_id is null
      order by a.id);
  end if;
  -- Locking the plan serialises two devices confirming the same team.
  select * into plan from public.planned_allocations where id = private.field_uuid(p_data, 'planned_allocation_id', true)
    and contract_id = contract_ref for update;
  if not found then raise exception 'Planned allocation not found on this contract' using errcode='23503'; end if;
  if plan.superseded_by is not null or plan.cancelled_at is not null then
    raise exception 'The office has revised or cancelled this plan; reload today''s plan' using errcode='40001';
  end if;
  starts := coalesce(private.field_timestamp(p_data, 'started_at'), now());
  work_day := (starts at time zone 'Europe/London')::date;
  if work_day not between plan.planned_start and plan.planned_end then
    raise exception 'This plan does not cover %', to_char(work_day, 'DD Mon YYYY') using errcode='22023';
  end if;
  select * into existing from public.actual_allocations where planned_allocation_id = plan.id and work_date = work_day and voided_at is null
    order by recorded_at limit 1;
  if found then
    select m.display_name into actor from public.organisation_members m where m.user_id = existing.confirmed_by;
    raise exception 'Already confirmed by % at %. Open the team to move it or record arrivals and departures.',
      coalesce(actor, 'another user'), to_char(existing.recorded_at at time zone 'Europe/London', 'HH24:MI') using errcode='23514';
  end if;

  if p_data ? 'absent' and (jsonb_typeof(p_data->'absent') <> 'array' or jsonb_array_length(p_data->'absent') > 60) then
    raise exception 'Absences must be a list of at most 60 operatives' using errcode='22023';
  end if;
  for entry in select value from jsonb_array_elements(coalesce(p_data->'absent', '[]'::jsonb)) loop
    perform private.only_keys(entry, array['operative_id','reason']);
    absent_ref := private.field_uuid(entry, 'operative_id', true);
    if absent_ref = any(absent_refs) then raise exception 'An operative is listed as absent twice' using errcode='22023'; end if;
    if length(coalesce(private.field_text(entry, 'reason', 2000), '')) < 5 then
      raise exception 'Give a reason for each absence (at least 5 characters)' using errcode='22023';
    end if;
    if not exists (select 1 from public.planned_allocation_operatives where planned_allocation_id = plan.id and operative_id = absent_ref)
      and not exists (select 1 from public.team_memberships m where m.team_id = plan.team_id and m.operative_id = absent_ref
        and m.voided_at is null and work_day between m.valid_from and coalesce(m.valid_until, work_day)) then
      raise exception 'An absent operative was not planned for this work or a member of the planned team' using errcode='23514';
    end if;
    if exists (select 1 from public.actual_allocation_operatives ao join public.actual_allocations a on a.id = ao.actual_allocation_id
      where ao.operative_id = absent_ref and a.contract_id = plan.contract_id and a.work_date = work_day and a.voided_at is null) then
      raise exception 'An operative marked absent is already recorded on site today' using errcode='23514';
    end if;
    absent_refs := absent_refs || absent_ref;
  end loop;

  if jsonb_typeof(p_data->'groups') is distinct from 'array' or jsonb_array_length(p_data->'groups') not between 1 and 10 then
    raise exception 'Record between 1 and 10 work locations' using errcode='22023';
  end if;
  group_count := jsonb_array_length(p_data->'groups');
  for entry in select value from jsonb_array_elements(p_data->'groups') loop
    perform private.only_keys(entry, array['work_area_id','stage','operative_ids','lead_operative_id']);
    group_operatives := private.field_uuids(entry, 'operative_ids', 60);
    if cardinality(group_operatives) = 0 then raise exception 'List who is working at each location' using errcode='22023'; end if;
    if group_operatives && assigned then raise exception 'An operative cannot be in two places at once' using errcode='22023'; end if;
    if group_operatives && absent_refs then raise exception 'An operative cannot be both present and absent' using errcode='22023'; end if;
    lead_ref := private.field_uuid(entry, 'lead_operative_id');
    if lead_ref is not null and not (lead_ref = any(group_operatives)) then
      raise exception 'The acting lead must be one of the operatives at that location' using errcode='22023';
    end if;
    if coalesce(private.field_uuid(entry, 'work_area_id'), plan.work_area_id) <> plan.work_area_id
      or coalesce(private.field_text(entry, 'stage', 30), plan.stage) <> plan.stage then
      plain := false;
    end if;
    assigned := assigned || group_operatives;
  end loop;

  select coalesce(array_agg(operative_id order by operative_id), '{}') into planned
    from public.planned_allocation_operatives where planned_allocation_id = plan.id;
  caller_reason := nullif(private.field_text(p_data, 'reason', 2000), '');
  if caller_reason is null and cardinality(absent_refs) > 0 and group_count = 1 and plain
    and (cardinality(planned) = 0 or (assigned <@ planned and planned <@ (assigned || absent_refs))) then
    select left('Absent: ' || string_agg(o.display_name || ' (' || trim(e->>'reason') || ')', '; ' order by o.display_name), 2000) into derived
      from jsonb_array_elements(p_data->'absent') e join public.operatives o on o.id = (e->>'operative_id')::uuid;
  end if;

  insert into public.allocation_absences(organisation_id, contract_id, planned_allocation_id, work_date, operative_id, reason, recorded_by)
  select org, plan.contract_id, plan.id, work_day, (e->>'operative_id')::uuid, trim(e->>'reason'), auth.uid()
  from jsonb_array_elements(coalesce(p_data->'absent', '[]'::jsonb)) e
  where not exists (select 1 from public.allocation_absences x where x.planned_allocation_id = plan.id and x.work_date = work_day
    and x.operative_id = (e->>'operative_id')::uuid and x.voided_at is null);

  for entry in select value from jsonb_array_elements(p_data->'groups') loop
    area_ref := coalesce(private.field_uuid(entry, 'work_area_id'), plan.work_area_id);
    stage_value := coalesce(private.field_text(entry, 'stage', 30), plan.stage);
    created := private.insert_actual_allocation(plan.contract_id, plan.id, area_ref,
      case when plan.work_package_id is not null and private.on_location_branch(plan.work_package_id, area_ref) then plan.work_package_id end,
      plan.team_id, stage_value, private.field_uuids(entry, 'operative_ids', 60), starts, null, coalesce(caller_reason, derived), null);
    perform private.apply_allocation_lead(created, private.field_uuid(entry, 'lead_operative_id'));
    results := results || created;
  end loop;
  perform private.record_request(org, 'confirm_planned_allocation', p_request_key, p_data, results[1]);
  return results;
end $$;

-- Records an acting lead on work already confirmed, once.
create function public.set_allocation_lead(p_allocation uuid, p_operative uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.actual_allocations;
begin
  select * into a from public.actual_allocations where id = p_allocation;
  if not found or not private.can_supervise_contract(a.contract_id) then raise exception 'Site supervision permission required' using errcode='42501'; end if;
  if a.voided_at is not null then raise exception 'This allocation was voided' using errcode='23514'; end if;
  if p_operative is null then raise exception 'Choose the acting lead' using errcode='22023'; end if;
  perform private.apply_allocation_lead(p_allocation, p_operative);
end $$;

-- Finishes every open period of work on the contract for the day of p_at, at
-- that time. Work started after p_at is left open. Repeating is a safe retry.
create function public.end_open_allocations(p_contract uuid, p_at timestamptz default null) returns integer
language plpgsql security definer set search_path='' as $$
declare ending timestamptz := coalesce(p_at, now()); a record; finished integer := 0;
begin
  if not private.can_supervise_contract(p_contract) then raise exception 'Site supervision permission required for this contract' using errcode='42501'; end if;
  if ending > now() + interval '5 minutes' then raise exception 'The finish time cannot be in the future' using errcode='22023'; end if;
  for a in select x.id, w.name from public.actual_allocations x join public.work_areas w on w.id = x.work_area_id
    where x.contract_id = p_contract and x.voided_at is null and x.ended_at is null and x.started_at < ending
      and x.work_date = (ending at time zone 'Europe/London')::date
    order by x.started_at, x.id for update of x loop
    if exists (select 1 from public.actual_allocation_operatives where actual_allocation_id = a.id and (joined_at >= ending or left_at > ending)) then
      raise exception 'Someone at % arrived or left after %; finish that work separately', a.name,
        to_char(ending at time zone 'Europe/London', 'HH24:MI') using errcode='23514';
    end if;
    update public.actual_allocations set ended_at = ending, ended_by = auth.uid(), ended_recorded_at = now() where id = a.id;
    finished := finished + 1;
  end loop;
  return finished;
end $$;

-- Names of the people who planned, confirmed or changed allocation records on
-- this contract, for its history. Nothing else from the member directory.
create function public.allocation_actor_names(p_contract uuid) returns table (user_id uuid, display_name text)
language sql stable security definer set search_path='' as $$
  select m.user_id, m.display_name from public.organisation_members m
  where private.can_supervise_contract(p_contract) and m.organisation_id = private.current_org() and m.user_id in (
    select confirmed_by from public.actual_allocations where contract_id = p_contract
    union select ended_by from public.actual_allocations where contract_id = p_contract
    union select voided_by from public.actual_allocations where contract_id = p_contract
    union select added_by from public.actual_allocation_operatives where contract_id = p_contract
    union select left_recorded_by from public.actual_allocation_operatives where contract_id = p_contract
    union select recorded_by from public.allocation_absences where contract_id = p_contract
    union select voided_by from public.allocation_absences where contract_id = p_contract
    union select created_by from public.planned_allocations where contract_id = p_contract
    union select cancelled_by from public.planned_allocations where contract_id = p_contract)
$$;

revoke all on function private.guard_allocation_lead(), private.apply_allocation_lead(uuid,uuid),
  private.clear_contradicted_absences(uuid,date,uuid,uuid[],timestamptz) from public, anon, authenticated;
revoke all on function public.confirm_planned_allocation(uuid,jsonb), public.set_allocation_lead(uuid,uuid),
  public.end_open_allocations(uuid,timestamptz), public.allocation_actor_names(uuid),
  public.record_actual_allocation(uuid,jsonb), public.reallocate_actual_allocation(uuid,uuid,jsonb),
  public.add_allocation_operative(uuid,uuid,timestamptz,text) from public, anon;
grant execute on function public.confirm_planned_allocation(uuid,jsonb), public.set_allocation_lead(uuid,uuid),
  public.end_open_allocations(uuid,timestamptz), public.allocation_actor_names(uuid),
  public.record_actual_allocation(uuid,jsonb), public.reallocate_actual_allocation(uuid,uuid,jsonb),
  public.add_allocation_operative(uuid,uuid,timestamptz,text) to authenticated;
commit;
