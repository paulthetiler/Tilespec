-- Phase 2B: the supervisor confirms the office's plan for the day and records
-- what actually happened. Scenario letters follow the Phase 2B brief.
-- Disposable local database only; permission assertions run as non-superusers.
begin;

insert into auth.users(id, email) values
  ('f5100000-0000-4000-8000-000000000001', 'dw-owner@example.invalid'),
  ('f5100000-0000-4000-8000-000000000002', 'dw-manager@example.invalid'),
  ('f5100000-0000-4000-8000-000000000003', 'dw-supervisor@example.invalid'),
  ('f5100000-0000-4000-8000-000000000004', 'dw-unassigned-supervisor@example.invalid'),
  ('f5100000-0000-4000-8000-000000000005', 'dw-installer@example.invalid'),
  ('f5100000-0000-4000-8000-000000000006', 'dw-other-supervisor@example.invalid'),
  ('f5100000-0000-4000-8000-000000000007', 'dw-other-owner@example.invalid');
insert into public.organisations(id, name) values
  ('f5200000-0000-4000-8000-000000000001', 'Daily workforce contractor'), ('f5200000-0000-4000-8000-000000000002', 'Another contractor');
insert into public.organisation_members(organisation_id, user_id, display_name, role, financial_access) values
  ('f5200000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000001', 'Olive Owner', 'owner', true),
  ('f5200000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000002', 'Mia Manager', 'contracts_manager', false),
  ('f5200000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000003', 'Sid Supervisor', 'supervisor', false),
  ('f5200000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000004', 'Una Unassigned', 'supervisor', false),
  ('f5200000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000005', 'Ian Installer', 'subcontract_installer', false),
  ('f5200000-0000-4000-8000-000000000002', 'f5100000-0000-4000-8000-000000000006', 'Oscar Other', 'supervisor', false),
  ('f5200000-0000-4000-8000-000000000002', 'f5100000-0000-4000-8000-000000000007', 'Ola Other', 'owner', true);
insert into public.contracts(id, organisation_id, reference, name, created_by) values
  ('f5300000-0000-4000-8000-000000000001', 'f5200000-0000-4000-8000-000000000001', 'APT-B', 'Riverside apartments Block B', 'f5100000-0000-4000-8000-000000000001'),
  ('f5300000-0000-4000-8000-000000000002', 'f5200000-0000-4000-8000-000000000002', 'OTHER-1', 'Another contractor site', 'f5100000-0000-4000-8000-000000000007');
insert into public.contract_assignments(contract_id, organisation_id, user_id) values
  ('f5300000-0000-4000-8000-000000000001', 'f5200000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000002'),
  ('f5300000-0000-4000-8000-000000000001', 'f5200000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000003'),
  ('f5300000-0000-4000-8000-000000000002', 'f5200000-0000-4000-8000-000000000002', 'f5100000-0000-4000-8000-000000000006');

-- Every time is on a fixed past day, so the test never depends on the clock.
select private.site_today() - 1 as day \gset
select (:'day'::date + time '07:30') at time zone 'Europe/London' as t0730, (:'day'::date + time '08:00') at time zone 'Europe/London' as t0800,
  (:'day'::date + time '08:30') at time zone 'Europe/London' as t0830, (:'day'::date + time '09:30') at time zone 'Europe/London' as t0930,
  (:'day'::date + time '10:00') at time zone 'Europe/London' as t1000, (:'day'::date + time '11:00') at time zone 'Europe/London' as t1100,
  (:'day'::date + time '12:00') at time zone 'Europe/London' as t1200, (:'day'::date + time '13:00') at time zone 'Europe/London' as t1300, (:'day'::date + time '14:00') at time zone 'Europe/London' as t1400,
  (:'day'::date + time '16:00') at time zone 'Europe/London' as t1600, (:'day'::date + time '16:30') at time zone 'Europe/London' as t1630 \gset

-- The office sets up the site, the workforce and the day's plan.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f5100000-0000-4000-8000-000000000002"}', true);
select public.create_locations('f5300000-0000-4000-8000-000000000001', gen_random_uuid(), null, jsonb_build_array(
  jsonb_build_object('name', 'Block B', 'children', jsonb_build_array(jsonb_build_object('name', 'Level 5', 'children',
    (select jsonb_agg(jsonb_build_object('name', 'Flat ' || n, 'children', jsonb_build_array(jsonb_build_object('name', 'Bathroom'), jsonb_build_object('name', 'Kitchen'))))
     from generate_series(51, 59) n)))),
  jsonb_build_object('name', 'Communal corridors', 'children', jsonb_build_array(jsonb_build_object('name', 'Corridor 1'), jsonb_build_object('name', 'Corridor 2')))));
select id as flat51 from public.work_areas where name = 'Flat 51' \gset
select id as flat52 from public.work_areas where name = 'Flat 52' \gset
select id as flat55 from public.work_areas where name = 'Flat 55' \gset
select id as flat56 from public.work_areas where name = 'Flat 56' \gset
select id as flat59 from public.work_areas where name = 'Flat 59' \gset
select id as bath52 from public.work_areas where name = 'Bathroom' and parent_id = :'flat52' \gset
select id as bath53 from public.work_areas w where name = 'Bathroom' and parent_id = (select id from public.work_areas where name = 'Flat 53') \gset
select id as kitchen54 from public.work_areas w where name = 'Kitchen' and parent_id = (select id from public.work_areas where name = 'Flat 54') \gset
select id as communal from public.work_areas where name = 'Communal corridors' \gset
select id as corridor1 from public.work_areas where name = 'Corridor 1' \gset
select id as corridor2 from public.work_areas where name = 'Corridor 2' \gset

select public.create_company(gen_random_uuid(), '{"name":"Smith Tiling Ltd"}') as smith_co \gset
select public.create_company(gen_random_uuid(), '{"name":"Jones Installations"}') as jones_co \gset
select public.create_company(gen_random_uuid(), '{"name":"Wet Area Specialists"}') as wet_co \gset
create temporary table people(name text primary key, id uuid) on commit drop;
insert into people select name, public.create_operative(gen_random_uuid(), jsonb_build_object('display_name', name, 'engagement', engagement, 'company_id', company))
from (values ('Sam Smith', 'subcontractor', :'smith_co'), ('Tom Baker', 'subcontractor', :'smith_co'), ('Lee Hart', 'subcontractor', :'smith_co'),
  ('Max Reed', 'subcontractor', :'smith_co'), ('Jo Jones', 'subcontractor', :'jones_co'), ('Kim Lowe', 'subcontractor', :'jones_co'),
  ('Pat Moss', 'subcontractor', :'jones_co'), ('Ray Dunn', 'subcontractor', :'jones_co'), ('Ben Ward', 'subcontractor', :'jones_co'),
  ('Dan Price', 'direct_employee', null), ('Eve Shaw', 'direct_employee', null), ('Ian Cole', 'direct_employee', null), ('Uma Bell', 'direct_employee', null),
  ('Nia Fox', 'subcontractor', :'wet_co'), ('Ali Khan', 'subcontractor', :'jones_co'), ('Zak Hill', 'subcontractor', :'jones_co')) p(name, engagement, company);
create function pg_temp.person(p_name text) returns uuid language sql stable as $$ select id from people where name = p_name $$;
create function pg_temp.people(p_names text[]) returns jsonb language sql stable as $$ select jsonb_agg(id) from people where name = any(p_names) $$;

select public.create_team(gen_random_uuid(), jsonb_build_object('name', 'Smith Tiling', 'kind', 'subcontract_gang', 'company_id', :'smith_co')) as smith \gset
select public.create_team(gen_random_uuid(), jsonb_build_object('name', 'Jones Installations', 'kind', 'subcontract_gang', 'company_id', :'jones_co')) as jones \gset
select public.create_team(gen_random_uuid(), jsonb_build_object('name', 'Moss Pair', 'kind', 'subcontract_gang', 'company_id', :'jones_co')) as moss \gset
select public.create_team(gen_random_uuid(), '{"name":"Direct Team A","kind":"direct_team"}') as direct \gset
select public.create_team(gen_random_uuid(), jsonb_build_object('name', 'Wet Area Team', 'kind', 'individual_subcontractor', 'company_id', :'wet_co')) as wet \gset
select public.create_team(gen_random_uuid(), jsonb_build_object('name', 'Hart Gang', 'kind', 'subcontract_gang', 'company_id', :'jones_co')) as hart \gset
select count(*) from (select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', team, 'operative_id', pg_temp.person(name),
  'is_lead', lead, 'valid_from', (:'day'::date - 30)::text))
from (values (:'smith', 'Sam Smith', true), (:'smith', 'Tom Baker', false), (:'smith', 'Lee Hart', false), (:'smith', 'Max Reed', false),
  (:'jones', 'Jo Jones', true), (:'jones', 'Kim Lowe', false), (:'jones', 'Pat Moss', false), (:'moss', 'Ray Dunn', true), (:'moss', 'Ben Ward', false),
  (:'direct', 'Dan Price', true), (:'direct', 'Eve Shaw', false), (:'direct', 'Ian Cole', false), (:'direct', 'Uma Bell', false),
  (:'wet', 'Nia Fox', true), (:'hart', 'Ali Khan', true), (:'hart', 'Zak Hill', false)) m(team, name, lead)) added;
create temporary table memberships_before on commit drop as select * from public.team_memberships;

create function pg_temp.plan(p_team uuid, p_area uuid, p_names text[], p_stage text default 'installation') returns uuid language sql as $$
  select public.plan_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'f5300000-0000-4000-8000-000000000001', 'work_area_id', p_area,
    'team_id', p_team, 'stage', p_stage, 'planned_start', (private.site_today() - 3)::text, 'planned_end', (private.site_today() + 2)::text,
    'operative_ids', coalesce(pg_temp.people(p_names), '[]'::jsonb)))
$$;
select pg_temp.plan(:'jones', :'flat56', array['Jo Jones','Kim Lowe','Pat Moss']) as plan_jones \gset
select pg_temp.plan(:'smith', :'bath52', array['Sam Smith','Tom Baker','Lee Hart','Max Reed']) as plan_smith \gset
select pg_temp.plan(:'moss', :'flat52', array['Ray Dunn','Ben Ward']) as plan_moss \gset
select pg_temp.plan(:'direct', :'communal', array['Dan Price','Eve Shaw','Ian Cole','Uma Bell'], 'preparation') as plan_direct \gset
select pg_temp.plan(:'hart', :'flat51', array['Ali Khan','Zak Hill']) as plan_hart \gset
create temporary table plans_before on commit drop as select * from public.planned_allocations;

select set_config('request.jwt.claims', '{"sub":"f5100000-0000-4000-8000-000000000003"}', true);

-- Scenario A: an ordinary morning. Jones arrives exactly as planned; one tap.
select public.confirm_planned_allocation('f5400000-0000-4000-8000-00000000000a', jsonb_build_object('contract_id', 'f5300000-0000-4000-8000-000000000001',
  'planned_allocation_id', :'plan_jones', 'started_at', :'t0730'::timestamptz, 'groups', jsonb_build_array(jsonb_build_object(
    'operative_ids', pg_temp.people(array['Jo Jones','Kim Lowe','Pat Moss']), 'lead_operative_id', pg_temp.person('Jo Jones'))))) as jones_ids \gset
select (:'jones_ids'::uuid[])[1] as a_jones \gset
select test.assert((select work_area_id = :'flat56' and team_id = :'jones' and stage = 'installation' and deviations = '{}' and deviation_reason is null
  and work_date = :'day' and started_at = :'t0730' and ended_at is null and confirmed_by = auth.uid() and lead_operative_id = pg_temp.person('Jo Jones')
  and work_package_id is null from public.actual_allocations where id = :'a_jones'),
  'A: the gang confirmed as planned is recorded at the planned location, stage and time, with no deviation and no note');
select test.assert((select array_agg(o.display_name order by o.display_name) = array['Jo Jones','Kim Lowe','Pat Moss'] and bool_and(ao.joined_at = :'t0730')
  from public.actual_allocation_operatives ao join public.operatives o on o.id = ao.operative_id where ao.actual_allocation_id = :'a_jones'),
  'A: each of the three operatives is recorded present from the start time');
select test.assert((select count(*) = 0 from public.allocation_absences where planned_allocation_id = :'plan_jones'), 'A: no absence is recorded');

-- Scenario H (part): a retry after a lost response returns the same records.
select test.assert(public.confirm_planned_allocation('f5400000-0000-4000-8000-00000000000a', jsonb_build_object('contract_id', 'f5300000-0000-4000-8000-000000000001',
  'planned_allocation_id', :'plan_jones', 'started_at', :'t0730'::timestamptz, 'groups', jsonb_build_array(jsonb_build_object(
    'operative_ids', pg_temp.people(array['Jo Jones','Kim Lowe','Pat Moss']), 'lead_operative_id', pg_temp.person('Jo Jones'))))) = :'jones_ids'::uuid[]
  and (select count(*) = 1 from public.actual_allocations where planned_allocation_id = :'plan_jones'),
  'H: retrying a confirmation with the same request key returns the same allocation and creates nothing');
select test.expect_error(format($q$select public.confirm_planned_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'f5300000-0000-4000-8000-000000000001',
  'planned_allocation_id', %L, 'started_at', %L::timestamptz, 'groups', jsonb_build_array(jsonb_build_object('operative_ids', pg_temp.people(array['Jo Jones'])))))$q$, :'plan_jones', :'t0800'),
  array['23514'], 'H: a second confirmation of the same team that day, from another device, is refused');

-- Scenario B: four planned, three present. The absent operative is recorded;
-- no attendance is invented for them, and their absence is the reason.
select public.confirm_planned_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'f5300000-0000-4000-8000-000000000001',
  'planned_allocation_id', :'plan_smith', 'started_at', :'t0800'::timestamptz,
  'groups', jsonb_build_array(jsonb_build_object('operative_ids', pg_temp.people(array['Sam Smith','Tom Baker','Lee Hart']), 'lead_operative_id', pg_temp.person('Sam Smith'))),
  'absent', jsonb_build_array(jsonb_build_object('operative_id', pg_temp.person('Max Reed'), 'reason', 'Off sick')))) as smith_ids \gset
select (:'smith_ids'::uuid[])[1] as a_smith \gset
select test.assert((select deviations = array['operatives_changed'] and deviation_reason = 'Absent: Max Reed (Off sick)' from public.actual_allocations where id = :'a_smith'),
  'B: the missing operative is the recorded deviation, with their absence as the reason');
select test.assert((select count(*) = 3 and not bool_or(operative_id = pg_temp.person('Max Reed')) from public.actual_allocation_operatives where actual_allocation_id = :'a_smith'),
  'B: no attendance is recorded for the absent operative');
select test.assert((select count(*) = 1 and bool_and(reason = 'Off sick' and work_date = :'day' and recorded_by = auth.uid())
  from public.allocation_absences where planned_allocation_id = :'plan_smith' and operative_id = pg_temp.person('Max Reed') and voided_at is null),
  'B: the absence is recorded with who recorded it and why');
select test.expect_error(format($q$select public.confirm_planned_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'f5300000-0000-4000-8000-000000000001',
  'planned_allocation_id', %L, 'started_at', %L::timestamptz, 'groups', jsonb_build_array(jsonb_build_object('operative_ids', pg_temp.people(array['Ray Dunn'])))))$q$, :'plan_moss', :'t0800'),
  array['22023'], 'B: a planned operative left out without a reason is refused, so attendance is never silently short');

-- Scenario C: Moss Pair planned for Flat 52, moved to Flat 59 on arrival.
select test.expect_error(format($q$select public.confirm_planned_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'f5300000-0000-4000-8000-000000000001',
  'planned_allocation_id', %L, 'started_at', %L::timestamptz, 'groups', jsonb_build_array(jsonb_build_object('work_area_id', %L, 'operative_ids', pg_temp.people(array['Ray Dunn','Ben Ward'])))))$q$,
  :'plan_moss', :'t0800', :'flat59'), array['22023'], 'C: moving a team from its planned location needs a reason');
select public.confirm_planned_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'f5300000-0000-4000-8000-000000000001',
  'planned_allocation_id', :'plan_moss', 'started_at', :'t0800'::timestamptz, 'reason', 'Flat 52 screed still wet',
  'groups', jsonb_build_array(jsonb_build_object('work_area_id', :'flat59', 'operative_ids', pg_temp.people(array['Ray Dunn','Ben Ward']))))) as moss_ids \gset
select test.assert((select a.work_area_id = :'flat59' and a.deviations = array['location_changed'] and a.deviation_reason = 'Flat 52 screed still wet'
  and p.work_area_id = :'flat52' and p.superseded_by is null
  from public.actual_allocations a join public.planned_allocations p on p.id = a.planned_allocation_id where a.id = (:'moss_ids'::uuid[])[1]),
  'C: the actual location is Flat 59 while the plan still says Flat 52, linked and with the reason');

-- Scenario D: Direct Team A split between two corridors from the start.
select public.confirm_planned_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'f5300000-0000-4000-8000-000000000001',
  'planned_allocation_id', :'plan_direct', 'started_at', :'t0800'::timestamptz, 'reason', 'Split to finish both corridors',
  'groups', jsonb_build_array(
    jsonb_build_object('work_area_id', :'corridor1', 'operative_ids', pg_temp.people(array['Dan Price','Eve Shaw']), 'lead_operative_id', pg_temp.person('Dan Price')),
    jsonb_build_object('work_area_id', :'corridor2', 'operative_ids', pg_temp.people(array['Ian Cole','Uma Bell']), 'lead_operative_id', pg_temp.person('Ian Cole'))))) as direct_ids \gset
select test.assert((select array_agg(w.name || ':' || (select string_agg(o.display_name, '+' order by o.display_name) from public.actual_allocation_operatives ao
    join public.operatives o on o.id = ao.operative_id where ao.actual_allocation_id = a.id) || ':' || l.display_name order by w.name)
    = array['Corridor 1:Dan Price+Eve Shaw:Dan Price', 'Corridor 2:Ian Cole+Uma Bell:Ian Cole']
  and bool_and(a.started_at = :'t0800' and a.ended_at is null and a.planned_allocation_id = :'plan_direct' and a.stage = 'preparation')
  from public.actual_allocations a join public.work_areas w on w.id = a.work_area_id join public.operatives l on l.id = a.lead_operative_id
  where a.id = any(:'direct_ids'::uuid[])),
  'D: each corridor has its own people, acting lead and working period, both inside the planned area');
select test.expect_error(format($q$select public.confirm_planned_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'f5300000-0000-4000-8000-000000000001',
  'planned_allocation_id', %L, 'started_at', %L::timestamptz, 'reason', 'Split', 'groups', jsonb_build_array(
    jsonb_build_object('operative_ids', pg_temp.people(array['Ali Khan'])), jsonb_build_object('operative_ids', pg_temp.people(array['Ali Khan','Zak Hill'])))))$q$,
  :'plan_hart', :'t0800'), array['22023'], 'D: one person cannot be put in both halves of a split');
select test.expect_error(format($q$select public.confirm_planned_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'f5300000-0000-4000-8000-000000000001',
  'planned_allocation_id', %L, 'started_at', %L::timestamptz, 'reason', 'Helping out', 'groups', jsonb_build_array(jsonb_build_object('operative_ids', pg_temp.people(array['Ali Khan','Sam Smith'])))))$q$,
  :'plan_hart', :'t0830'), array['23P01'], 'D: nobody can be recorded in two places at once, even across teams');

-- Scenario E: Smith moves during the day. Each period is kept exactly.
create temporary table smith_morning on commit drop as select * from public.actual_allocations where id = :'a_smith';
select public.reallocate_actual_allocation('f5400000-0000-4000-8000-0000000000e1', :'a_smith',
  jsonb_build_object('at', :'t1100'::timestamptz, 'reason', 'Flat 52 bathroom finished', 'targets', jsonb_build_array(
    jsonb_build_object('work_area_id', :'bath53', 'lead_operative_id', pg_temp.person('Sam Smith'))))) as midday \gset
select (:'midday'::uuid[])[1] as a_smith2 \gset
select test.assert(public.reallocate_actual_allocation('f5400000-0000-4000-8000-0000000000e1', :'a_smith',
  jsonb_build_object('at', :'t1100'::timestamptz, 'reason', 'Flat 52 bathroom finished', 'targets', jsonb_build_array(
    jsonb_build_object('work_area_id', :'bath53', 'lead_operative_id', pg_temp.person('Sam Smith'))))) = :'midday'::uuid[],
  'E/H: retrying a move with the same request key returns the same records');
select public.record_operative_departure(:'a_smith2', pg_temp.person('Lee Hart'), :'t1200', 'Dentist');
select public.reallocate_actual_allocation(gen_random_uuid(), :'a_smith2',
  jsonb_build_object('at', :'t1300'::timestamptz, 'reason', 'Kitchen ready for tiling', 'targets', jsonb_build_array(jsonb_build_object('work_area_id', :'kitchen54')))) as afternoon \gset
select (:'afternoon'::uuid[])[1] as a_smith3 \gset
select test.assert((select (to_jsonb(a) - array['ended_at','ended_by','ended_recorded_at']) = (to_jsonb(m) - array['ended_at','ended_by','ended_recorded_at'])
  and a.ended_at = :'t1100' from public.actual_allocations a, smith_morning m where a.id = :'a_smith'),
  'E: the morning record is unchanged except that it ended when the gang moved');
select test.assert((select array_agg(w.name || '@' || p.name || ' ' || to_char(a.started_at at time zone 'Europe/London', 'HH24:MI') || '-'
    || coalesce(to_char(a.ended_at at time zone 'Europe/London', 'HH24:MI'), 'open') order by a.started_at)
  = array['Bathroom@Flat 52 08:00-11:00', 'Bathroom@Flat 53 11:00-13:00', 'Kitchen@Flat 54 13:00-open']
  from public.actual_allocations a join public.work_areas w on w.id = a.work_area_id join public.work_areas p on p.id = w.parent_id
  where a.planned_allocation_id = :'plan_smith' and a.voided_at is null), 'E: every period of the day is kept: 08:00-11:00, 11:00-13:00 and 13:00 onwards');
select test.assert((select previous_allocation_id = :'a_smith2' and lead_operative_id is null from public.actual_allocations where id = :'a_smith3')
  and (select count(*) = 2 and not bool_or(operative_id = pg_temp.person('Lee Hart')) from public.actual_allocation_operatives where actual_allocation_id = :'a_smith3'),
  'E: each move links back to the period before it, and Lee, who left at 12:00, is not carried into the afternoon');

-- Late arrival, a team recorded not on site that then turns up, and a
-- person recorded absent who arrives: the absences are voided, never left
-- contradicting the attendance.
select public.record_allocation_absence(gen_random_uuid(), jsonb_build_object('planned_allocation_id', :'plan_hart', 'work_date', :'day', 'reason', 'Did not turn up')) as hart_absent \gset
select public.confirm_planned_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'f5300000-0000-4000-8000-000000000001',
  'planned_allocation_id', :'plan_hart', 'started_at', :'t1000'::timestamptz, 'groups', jsonb_build_array(jsonb_build_object('operative_ids', pg_temp.people(array['Ali Khan']))),
  'absent', jsonb_build_array(jsonb_build_object('operative_id', pg_temp.person('Zak Hill'), 'reason', 'No show')))) as hart_ids \gset
select test.assert((select voided_at is not null and void_reason = 'Recorded on site at 10:00' from public.allocation_absences where id = :'hart_absent'),
  'a team recorded as not on site that arrives later has that record voided with the arrival time, not deleted');
select public.add_allocation_operative((:'hart_ids'::uuid[])[1], pg_temp.person('Zak Hill'), :'t1100', 'Late arrival') as zak_row \gset
select test.assert((select count(*) = 0 from public.allocation_absences where operative_id = pg_temp.person('Zak Hill') and voided_at is null)
  and (select joined_at = :'t1100' and note = 'Late arrival' from public.actual_allocation_operatives where id = :'zak_row'),
  'a late arrival is recorded from the time they arrived, and their earlier absence is voided');
select test.assert(public.add_allocation_operative((:'hart_ids'::uuid[])[1], pg_temp.person('Zak Hill'), null, null) = :'zak_row',
  'H: repeating an arrival is a safe retry');
select test.expect_error(format($q$select public.record_allocation_absence(gen_random_uuid(), jsonb_build_object('planned_allocation_id', %L, 'work_date', %L, 'operative_id', %L, 'reason', 'Changed my mind'))$q$,
  :'plan_hart', :'day', pg_temp.person('Ali Khan')), array['23514'], 'someone on site cannot also be recorded absent');

-- Scenario F: unexpected labour. A registered team that is not on the plan
-- arrives at 11:00, with a new person the supervisor registers provisionally.
select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'f5300000-0000-4000-8000-000000000001', 'team_id', :'wet',
  'work_area_id', :'flat55', 'stage', 'waterproofing', 'started_at', :'t1100'::timestamptz, 'operative_ids', pg_temp.people(array['Nia Fox']),
  'reason', 'Called in to tank Flat 55 shower', 'lead_operative_id', pg_temp.person('Nia Fox'))) as a_wet \gset
select public.create_operative(gen_random_uuid(), jsonb_build_object('display_name', 'New Labourer', 'engagement', 'subcontractor', 'company_id', :'wet_co')) as newcomer \gset
select public.add_allocation_operative(:'a_wet', :'newcomer', :'t1100', 'Additional labour sent by Wet Area Specialists');
select test.assert((select deviations = array['unplanned'] and planned_allocation_id is null and lead_operative_id = pg_temp.person('Nia Fox') from public.actual_allocations where id = :'a_wet')
  and (select status = 'provisional' and created_by = auth.uid() from public.operatives where id = :'newcomer'),
  'F: unplanned labour is recorded as such, and the new person stays provisional until the office confirms them');
select test.expect_error($q$select public.create_company(gen_random_uuid(), '{"name":"Walk-in Tilers Ltd"}')$q$, array['42501'],
  'F: a supervisor still cannot create a subcontractor company');
select test.expect_error(format($q$select public.update_operative(%L, 1, '{"status":"active"}')$q$, :'newcomer'), array['42501'],
  'F: a supervisor cannot approve the person they registered');
select test.expect_error(format($q$select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'f5300000-0000-4000-8000-000000000001',
  'work_area_id', %L, 'stage', 'installation', 'started_at', %L::timestamptz, 'operative_ids', pg_temp.people(array['Kim Lowe']), 'reason', 'Extra'))$q$, :'flat55', :'t1100'),
  array['23P01'], 'F: an operative already working elsewhere cannot be recorded as extra labour at the same time');

-- Acting leads and the end of the day.
select test.expect_error(format($q$select public.set_allocation_lead(%L, %L)$q$, :'a_smith3', pg_temp.person('Jo Jones')), array['23514'],
  'the acting lead must be someone on that work');
select public.set_allocation_lead(:'a_smith3', pg_temp.person('Tom Baker'));
select public.set_allocation_lead(:'a_smith3', pg_temp.person('Tom Baker'));
select test.expect_error(format($q$select public.set_allocation_lead(%L, %L)$q$, :'a_smith3', pg_temp.person('Sam Smith')), array['23514'],
  'an acting lead, once recorded, is not silently replaced');
select test.expect_error(format($q$select public.end_open_allocations('f5300000-0000-4000-8000-000000000001', now() + interval '1 hour')$q$), array['22023'],
  'the day cannot be finished at a future time');
select public.end_open_allocations('f5300000-0000-4000-8000-000000000001', :'t1630') as finished \gset
select test.assert(:finished = 7 and (select count(*) = 7 from public.actual_allocations where ended_at = :'t1630')
  and (select count(*) = 0 from public.actual_allocations where ended_at is null),
  'finishing the day ends every open period of work at the chosen time');
select test.assert(public.end_open_allocations('f5300000-0000-4000-8000-000000000001', :'t1630') = 0, 'H: finishing the day again changes nothing');

-- Nothing changed anyone's permanent team, and the office's plans are as written.
select test.assert((select count(*) = 0 from (select * from public.team_memberships except select * from memberships_before) changed)
  and (select count(*) = 0 from (select * from memberships_before except select * from public.team_memberships) removed),
  'no daily change alters anyone''s permanent team membership');
select test.assert((select count(*) = 0 from (select * from public.planned_allocations except select * from plans_before) changed),
  'the office''s plans are unchanged by everything the supervisor recorded');
select test.assert((select array_agg(display_name order by display_name) = array['Mia Manager', 'Sid Supervisor']
  from public.allocation_actor_names('f5300000-0000-4000-8000-000000000001')),
  'the supervisor can see who planned and confirmed the work, and no one else in the directory');

-- Scenario G: people without access to this contract read and change nothing.
select set_config('request.jwt.claims', '{"sub":"f5100000-0000-4000-8000-000000000006"}', true);
select test.assert((select count(*) = 0 from public.planned_allocations) and (select count(*) = 0 from public.actual_allocations)
  and (select count(*) = 0 from public.actual_allocation_operatives) and (select count(*) = 0 from public.allocation_absences)
  and (select count(*) = 0 from public.allocation_actor_names('f5300000-0000-4000-8000-000000000001')),
  'G: another organisation''s supervisor reads no plans, allocations, attendance, absences or names');
select test.expect_error(format($q$select public.confirm_planned_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'f5300000-0000-4000-8000-000000000001',
  'planned_allocation_id', %L, 'groups', jsonb_build_array(jsonb_build_object('operative_ids', pg_temp.people(array['Jo Jones'])))))$q$, :'plan_jones'),
  array['42501'], 'G: another organisation''s supervisor cannot confirm allocations');
select test.expect_error(format($q$select public.reallocate_actual_allocation(gen_random_uuid(), %L, '{"targets":[]}')$q$, :'a_jones'), array['42501'],
  'G: another organisation''s supervisor cannot move a gang');
select test.expect_error(format($q$select public.add_allocation_operative(%L, %L, null, 'Hijack attempt')$q$, :'a_jones', pg_temp.person('Ben Ward')), array['42501'],
  'G: another organisation''s supervisor cannot add people to an allocation');
select test.expect_error($q$select public.end_open_allocations('f5300000-0000-4000-8000-000000000001')$q$, array['42501'],
  'G: another organisation''s supervisor cannot finish the day');
select test.expect_error(format($q$select public.void_actual_allocation(%L, 'Hijack attempt')$q$, :'a_jones'), array['42501'],
  'G: another organisation''s supervisor cannot void records');
select set_config('request.jwt.claims', '{"sub":"f5100000-0000-4000-8000-000000000004"}', true);
select test.assert((select count(*) = 0 from public.actual_allocations), 'G: a supervisor not assigned to this contract reads no allocations');
select test.expect_error(format($q$select public.set_allocation_lead(%L, %L)$q$, :'a_jones', pg_temp.person('Kim Lowe')), array['42501'],
  'G: a supervisor not assigned to this contract cannot change records');
select set_config('request.jwt.claims', '{"sub":"f5100000-0000-4000-8000-000000000005"}', true);
select test.assert((select count(*) = 0 from public.actual_allocations) and (select count(*) = 0 from public.subcontractor_companies),
  'G: an installer reads no allocations or company records');
select test.expect_error(format($q$select public.confirm_planned_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'f5300000-0000-4000-8000-000000000001',
  'planned_allocation_id', %L, 'groups', jsonb_build_array(jsonb_build_object('operative_ids', pg_temp.people(array['Jo Jones'])))))$q$, :'plan_jones'),
  array['42501'], 'G: an installer cannot confirm allocations');

-- The office sees the same records.
select set_config('request.jwt.claims', '{"sub":"f5100000-0000-4000-8000-000000000002"}', true);
select test.assert((select count(*) = 9 from public.actual_allocations) and (select count(*) = 3 from public.allocation_absences),
  'the office reads every allocation and absence the supervisor recorded');

-- History cannot be rewritten, even by privileged SQL.
reset role;
select test.expect_error(format($q$update public.actual_allocations set lead_operative_id = %L where id = %L$q$, pg_temp.person('Sam Smith'), :'a_smith3'),
  array['42501'], 'a recorded acting lead cannot be rewritten even by privileged SQL');
select test.expect_error(format($q$update public.actual_allocations set work_area_id = %L where id = %L$q$, :'flat51', :'a_jones'),
  array['42501'], 'a confirmed location cannot be rewritten even by privileged SQL');
select test.assert(true, 'supervisor daily workforce PASSED');
rollback;
