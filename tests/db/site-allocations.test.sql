-- Planned vs actual allocations and attribution across realistic site days.
-- Scenario A: small showroom. Scenario B: apartment block with three gangs and
-- changes during the day. Scenario C: hospital with overlapping teams.
-- Disposable local database only; permission assertions run as non-superusers.
begin;

insert into auth.users(id, email) values
  ('c1000000-0000-0000-0000-000000000001', 'alloc-owner@example.invalid'),
  ('c1000000-0000-0000-0000-000000000002', 'alloc-manager@example.invalid'),
  ('c1000000-0000-0000-0000-000000000003', 'alloc-supervisor-a@example.invalid'),
  ('c1000000-0000-0000-0000-000000000004', 'alloc-supervisor-b@example.invalid'),
  ('c1000000-0000-0000-0000-000000000005', 'alloc-unassigned-supervisor@example.invalid'),
  ('c1000000-0000-0000-0000-000000000006', 'alloc-sam@example.invalid'),
  ('c1000000-0000-0000-0000-000000000007', 'alloc-unallocated-manager@example.invalid'),
  ('c1000000-0000-0000-0000-000000000008', 'alloc-other-owner@example.invalid');
insert into public.organisations(id, name) values
  ('c2000000-0000-0000-0000-000000000001', 'Allocations fixture company'),
  ('c2000000-0000-0000-0000-000000000002', 'Unrelated company');
insert into public.organisation_members(organisation_id, user_id, display_name, role, financial_access) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Owner', 'owner', true),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'Manager', 'contracts_manager', false),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'Supervisor A', 'supervisor', false),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004', 'Supervisor B', 'supervisor', false),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000005', 'Unassigned Supervisor', 'supervisor', false),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000006', 'Sam Smith', 'lead_installer', false),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000007', 'Unallocated Manager', 'contracts_manager', false),
  ('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000008', 'Other Owner', 'owner', true);
insert into public.contracts(id, organisation_id, reference, name, created_by) values
  ('c3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'APT-B', 'Riverside apartments Block B', 'c1000000-0000-0000-0000-000000000001'),
  ('c3000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', 'SHOW-1', 'Car showroom sales floor', 'c1000000-0000-0000-0000-000000000001'),
  ('c3000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000001', 'HOSP-W4', 'Hospital Ward 4', 'c1000000-0000-0000-0000-000000000001');
insert into public.contract_assignments(contract_id, organisation_id, user_id)
select c, 'c2000000-0000-0000-0000-000000000001', u from
  (values ('c3000000-0000-0000-0000-000000000001'::uuid), ('c3000000-0000-0000-0000-000000000002'), ('c3000000-0000-0000-0000-000000000003')) cs(c),
  (values ('c1000000-0000-0000-0000-000000000002'::uuid), ('c1000000-0000-0000-0000-000000000003')) us(u);
insert into public.contract_assignments(contract_id, organisation_id, user_id) values
  ('c3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004');

-- Directory (trusted fixture SQL; team RPCs are covered in teams.test.sql).
insert into public.operatives(id, organisation_id, display_name, engagement, company_name, user_id) values
  ('c4000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'Sam Smith', 'subcontractor', 'Smith Tiling Ltd', 'c1000000-0000-0000-0000-000000000006'),
  ('c4000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', 'Tom Baker', 'subcontractor', 'Smith Tiling Ltd', null),
  ('c4000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000001', 'Lee Hart', 'subcontractor', 'Smith Tiling Ltd', null),
  ('c4000000-0000-0000-0000-000000000004', 'c2000000-0000-0000-0000-000000000001', 'Jo Jones', 'subcontractor', 'Jones Installations', null),
  ('c4000000-0000-0000-0000-000000000005', 'c2000000-0000-0000-0000-000000000001', 'Kim Lowe', 'subcontractor', 'Jones Installations', null),
  ('c4000000-0000-0000-0000-000000000006', 'c2000000-0000-0000-0000-000000000001', 'Dan Price', 'direct_employee', '', null),
  ('c4000000-0000-0000-0000-000000000007', 'c2000000-0000-0000-0000-000000000001', 'Eve Shaw', 'direct_employee', '', null),
  ('c4000000-0000-0000-0000-000000000008', 'c2000000-0000-0000-0000-000000000001', 'Pat Moss', 'subcontractor', 'Moss Tiling', null),
  ('c4000000-0000-0000-0000-000000000009', 'c2000000-0000-0000-0000-000000000001', 'Ray Dunn', 'subcontractor', 'Moss Tiling', null),
  ('c4000000-0000-0000-0000-000000000010', 'c2000000-0000-0000-0000-000000000001', 'Ava Kerr', 'agency', 'Site Labour Agency', null),
  ('c4000000-0000-0000-0000-000000000011', 'c2000000-0000-0000-0000-000000000001', 'Nia Fox', 'subcontractor', 'Wet Area Specialists', null);
insert into public.operatives(id, organisation_id, display_name, engagement, company_name, status) values
  ('c4000000-0000-0000-0000-000000000012', 'c2000000-0000-0000-0000-000000000001', 'Replacement Labourer', 'agency', 'Site Labour Agency', 'provisional');
insert into public.teams(id, organisation_id, name, kind, contractor_name) values
  ('c5000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'Smith Tiling', 'subcontract_gang', 'Smith Tiling Ltd'),
  ('c5000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', 'Jones Installations', 'subcontract_gang', 'Jones Installations'),
  ('c5000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000001', 'Direct Team A', 'direct_team', ''),
  ('c5000000-0000-0000-0000-000000000004', 'c2000000-0000-0000-0000-000000000001', 'Showroom Pair', 'subcontract_gang', 'Moss Tiling'),
  ('c5000000-0000-0000-0000-000000000005', 'c2000000-0000-0000-0000-000000000001', 'Ward Team', 'mixed', ''),
  ('c5000000-0000-0000-0000-000000000006', 'c2000000-0000-0000-0000-000000000001', 'Wet Area Specialists', 'individual_subcontractor', 'Wet Area Specialists');
insert into public.team_memberships(organisation_id, team_id, operative_id, is_lead, valid_from)
select 'c2000000-0000-0000-0000-000000000001', t::uuid, o::uuid, l, private.site_today() - 60 from (values
  ('c5000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', true),
  ('c5000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000002', false),
  ('c5000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000003', false),
  ('c5000000-0000-0000-0000-000000000002', 'c4000000-0000-0000-0000-000000000004', true),
  ('c5000000-0000-0000-0000-000000000002', 'c4000000-0000-0000-0000-000000000005', false),
  ('c5000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000006', true),
  ('c5000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000007', false),
  ('c5000000-0000-0000-0000-000000000004', 'c4000000-0000-0000-0000-000000000008', true),
  ('c5000000-0000-0000-0000-000000000004', 'c4000000-0000-0000-0000-000000000009', false),
  ('c5000000-0000-0000-0000-000000000005', 'c4000000-0000-0000-0000-000000000010', true),
  ('c5000000-0000-0000-0000-000000000006', 'c4000000-0000-0000-0000-000000000011', true)) m(t, o, l);

-- The working day is two days ago in London time, so every time is in the past.
select private.site_today() - 2 as day \gset
select (:'day'::date + time '08:00') at time zone 'Europe/London' as t0800, (:'day'::date + time '10:30') at time zone 'Europe/London' as t1030,
  (:'day'::date + time '11:00') at time zone 'Europe/London' as t1100, (:'day'::date + time '13:00') at time zone 'Europe/London' as t1300,
  (:'day'::date + time '14:00') at time zone 'Europe/London' as t1400, (:'day'::date + time '16:00') at time zone 'Europe/London' as t1600 \gset
create function pg_temp.iso(t timestamptz) returns text language sql immutable as $$ select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') $$;
grant execute on function pg_temp.iso(timestamptz) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000002"}', true);
select public.create_locations('c3000000-0000-0000-0000-000000000001', gen_random_uuid(), null,
  '[{"name":"Block B","children":[{"name":"Level 5","children":[
     {"name":"Flat 52","children":[{"name":"Bathroom"},{"name":"Kitchen"}]},
     {"name":"Flat 53","children":[{"name":"Bathroom"},{"name":"Kitchen"}]},
     {"name":"Flat 55"},{"name":"Flat 56"}]}]},{"name":"Communal corridors"}]');
select public.create_locations('c3000000-0000-0000-0000-000000000002', gen_random_uuid(), null, '[{"name":"Sales floor"}]');
select public.create_locations('c3000000-0000-0000-0000-000000000003', gen_random_uuid(), null,
  '[{"name":"Ward 4","children":[{"name":"Room 12","children":[{"name":"Ensuite"}]}]}]');
select id as level5 from public.work_areas where name = 'Level 5' \gset
select id as flat52 from public.work_areas where name = 'Flat 52' \gset
select id as flat53 from public.work_areas where name = 'Flat 53' \gset
select id as flat55 from public.work_areas where name = 'Flat 55' \gset
select id as flat56 from public.work_areas where name = 'Flat 56' \gset
select id as bath52 from public.work_areas where name = 'Bathroom' and parent_id = :'flat52' \gset
select id as kitchen52 from public.work_areas where name = 'Kitchen' and parent_id = :'flat52' \gset
select id as communal from public.work_areas where name = 'Communal corridors' \gset
select id as sales from public.work_areas where name = 'Sales floor' \gset
select id as room12 from public.work_areas where name = 'Room 12' \gset
select id as ensuite from public.work_areas where name = 'Ensuite' \gset
reset role;
insert into public.work_packages(id, organisation_id, contract_id, work_area_id, name, quantity, unit) values
  ('c6000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', :'flat52', 'Flat 52 wall and floor tiling', 36, 'm2'),
  ('c6000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', :'flat55', 'Flat 55 wall and floor tiling', 36, 'm2');
set local role authenticated;

-- Office plans the day.
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000002"}', true);
select public.plan_allocation('c7000000-0000-0000-0000-000000000001', jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'work_area_id', :'flat52', 'work_package_id', 'c6000000-0000-0000-0000-000000000001', 'team_id', 'c5000000-0000-0000-0000-000000000001', 'stage', 'installation',
  'planned_start', (:'day'::date - 1)::text, 'planned_end', (:'day'::date + 1)::text, 'instructions', 'Bathroom first; protect bath panel',
  'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000002', 'c4000000-0000-0000-0000-000000000003'))) as plan_smith \gset
select public.plan_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'work_area_id', :'flat55', 'work_package_id', 'c6000000-0000-0000-0000-000000000002', 'team_id', 'c5000000-0000-0000-0000-000000000002', 'stage', 'installation',
  'planned_start', :'day', 'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000004', 'c4000000-0000-0000-0000-000000000005'))) as plan_jones \gset
select public.plan_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'work_area_id', :'communal', 'team_id', 'c5000000-0000-0000-0000-000000000003', 'stage', 'preparation', 'planned_start', :'day')) as plan_direct \gset
select test.assert(public.plan_allocation('c7000000-0000-0000-0000-000000000001', jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'work_area_id', :'flat52', 'work_package_id', 'c6000000-0000-0000-0000-000000000001', 'team_id', 'c5000000-0000-0000-0000-000000000001', 'stage', 'installation',
  'planned_start', (:'day'::date - 1)::text, 'planned_end', (:'day'::date + 1)::text, 'instructions', 'Bathroom first; protect bath panel',
  'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000002', 'c4000000-0000-0000-0000-000000000003'))) = :'plan_smith'
  and (select count(*) = 3 from public.planned_allocations), 'retrying a plan creates it once');
select test.expect_error(format($q$select public.plan_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'work_area_id', %L, 'work_package_id', 'c6000000-0000-0000-0000-000000000001', 'team_id', 'c5000000-0000-0000-0000-000000000002', 'stage', 'installation', 'planned_start', %L))$q$, :'flat55', :'day'),
  array['23514'], 'a plan cannot pair a location with another location''s work package');
select test.expect_error(format($q$select public.plan_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'work_area_id', %L, 'team_id', 'c5000000-0000-0000-0000-000000000002', 'stage', 'tiling', 'planned_start', %L))$q$, :'flat55', :'day'),
  array['22023'], 'a plan must use a recognised installation stage');
select test.expect_error(format($q$select public.plan_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'work_area_id', %L, 'team_id', 'c5000000-0000-0000-0000-000000000002', 'stage', 'installation', 'planned_start', %L,
  'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000012')))$q$, :'flat55', :'day'),
  array['23514'], 'a provisional operative cannot be planned until the office confirms them');

-- Showroom plan and Scenario A: one call, no typing, no deviations.
select public.plan_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000002', 'work_area_id', :'sales',
  'team_id', 'c5000000-0000-0000-0000-000000000004', 'stage', 'installation', 'planned_start', :'day',
  'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000008', 'c4000000-0000-0000-0000-000000000009'))) as plan_showroom \gset
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000003"}', true);
select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000002',
  'planned_allocation_id', :'plan_showroom', 'started_at', pg_temp.iso(:'t0800'),
  'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000008', 'c4000000-0000-0000-0000-000000000009'))) as showroom \gset
select test.assert((select deviations = '{}' and deviation_reason is null and work_area_id = :'sales' and team_id = 'c5000000-0000-0000-0000-000000000004'
  and stage = 'installation' and work_date = :'day' and confirmed_by = auth.uid() from public.actual_allocations where id = :'showroom'),
  'Scenario A: confirming the plan as-is needs only the plan and who is present; nothing is flagged');

-- Scenario B, 08:00: Lee is absent from Smith Tiling.
select test.expect_error(format($q$select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'planned_allocation_id', %L, 'started_at', pg_temp.iso(%L), 'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000002')))$q$,
  :'plan_smith', :'t0800'), array['22023'], 'a gang confirmed with different people from the plan requires a reason');
select test.expect_error(format($q$select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'planned_allocation_id', %L, 'operative_ids', '[]'::jsonb))$q$, :'plan_smith'),
  array['22023'], 'an allocation must name at least one person actually present; the gang plan is not attendance');
select test.expect_error(format($q$select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'planned_allocation_id', %L, 'deviations', '[]'::jsonb, 'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000001')))$q$, :'plan_smith'),
  array['22023'], 'deviation flags are computed by the database and cannot be supplied by the client');
select public.record_actual_allocation('c8000000-0000-0000-0000-000000000001', jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'planned_allocation_id', :'plan_smith', 'started_at', pg_temp.iso(:'t0800'), 'reason', 'Lee off sick',
  'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000002'))) as s1 \gset
select test.assert((select deviations = array['operatives_changed'] and deviation_reason = 'Lee off sick' from public.actual_allocations where id = :'s1'),
  'the difference from the plan is recorded with the supervisor''s reason');
select test.assert(public.record_actual_allocation('c8000000-0000-0000-0000-000000000001', jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'planned_allocation_id', :'plan_smith', 'started_at', pg_temp.iso(:'t0800'), 'reason', 'Lee off sick',
  'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000002'))) = :'s1'
  and (select count(*) = 1 from public.actual_allocations where planned_allocation_id = :'plan_smith'),
  'Scenario E: a retried submission after lost connectivity returns the same record');
select test.expect_error(format($q$select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'planned_allocation_id', %L, 'started_at', pg_temp.iso(%L), 'reason', 'Lee off sick',
  'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000002')))$q$, :'plan_smith', :'t1030'),
  array['23P01'], 'a duplicate submitted under a new key is refused: nobody can be recorded in two places at once');
select public.record_allocation_absence('c8000000-0000-0000-0000-000000000002', jsonb_build_object('planned_allocation_id', :'plan_smith',
  'work_date', :'day', 'operative_id', 'c4000000-0000-0000-0000-000000000003', 'reason', 'Off sick, phoned at 07:30')) as lee_absent \gset
select test.assert(public.record_allocation_absence('c8000000-0000-0000-0000-000000000002', jsonb_build_object('planned_allocation_id', :'plan_smith',
  'work_date', :'day', 'operative_id', 'c4000000-0000-0000-0000-000000000003', 'reason', 'Off sick, phoned at 07:30')) = :'lee_absent',
  'retrying an absence returns the same record');
select test.expect_error(format($q$select public.record_allocation_absence(gen_random_uuid(), jsonb_build_object('planned_allocation_id', %L,
  'work_date', %L, 'operative_id', 'c4000000-0000-0000-0000-000000000001', 'reason', 'Marked absent in error'))$q$, :'plan_smith', :'day'),
  array['23514'], 'an operative recorded on site cannot also be recorded absent that day');

select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'planned_allocation_id', :'plan_jones', 'started_at', pg_temp.iso(:'t0800'),
  'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000004', 'c4000000-0000-0000-0000-000000000005'))) as j1 \gset
select test.expect_error(format($q$select public.record_allocation_absence(gen_random_uuid(), jsonb_build_object('planned_allocation_id', %L, 'work_date', %L, 'reason', 'Team did not attend'))$q$,
  :'plan_jones', :'day'), array['23514'], 'a team confirmed on site cannot also be recorded absent');

-- Direct Team A recorded at the wrong flat, then corrected by voiding.
select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'planned_allocation_id', :'plan_direct', 'work_area_id', :'flat56', 'started_at', pg_temp.iso(:'t0800'), 'reason', 'Corridor blocked by scaffold',
  'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000006', 'c4000000-0000-0000-0000-000000000007'))) as d_wrong \gset
select test.assert((select deviations = array['location_changed'] from public.actual_allocations where id = :'d_wrong'), 'working away from the planned location is flagged');
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000004"}', true);
select test.expect_error(format($q$select public.void_actual_allocation(%L, 'Not my record but voiding anyway')$q$, :'d_wrong'),
  array['42501'], 'another supervisor cannot void a colleague''s record');
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000003"}', true);
select public.void_actual_allocation(:'d_wrong', 'Tapped Flat 56 by mistake; team was in the corridors');
select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'planned_allocation_id', :'plan_direct', 'started_at', pg_temp.iso(:'t0800'),
  'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000006', 'c4000000-0000-0000-0000-000000000007'))) as d1 \gset
select test.assert((select voided_by = auth.uid() and void_reason like 'Tapped Flat 56%' from public.actual_allocations where id = :'d_wrong')
  and (select count(*) = 2 from public.actual_allocations where planned_allocation_id = :'plan_direct'),
  'the voided record stays visible with who voided it and why, beside the correct one');

-- 10:30: Smith Tiling splits. Sam stays in the Flat 52 bathroom, Tom moves to Flat 53.
select test.expect_error(format($q$select public.reallocate_actual_allocation(gen_random_uuid(), %L, jsonb_build_object('at', pg_temp.iso(%L), 'reason', 'Split gang',
  'targets', jsonb_build_array(jsonb_build_object('work_area_id', %L, 'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000002')),
    jsonb_build_object('work_area_id', %L, 'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000002')))))$q$, :'s1', :'t1030', :'bath52', :'flat53'),
  array['22023'], 'a split cannot send the same person to two places');
select test.expect_error(format($q$select public.reallocate_actual_allocation(gen_random_uuid(), %L, jsonb_build_object('at', pg_temp.iso(%L), 'reason', 'Split gang',
  'targets', jsonb_build_array(jsonb_build_object('work_area_id', %L, 'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000004')))))$q$, :'s1', :'t1030', :'bath52'),
  array['23514'], 'a move can only carry people who were on the original allocation');
select public.reallocate_actual_allocation('c8000000-0000-0000-0000-000000000003', :'s1', jsonb_build_object('at', pg_temp.iso(:'t1030'),
  'reason', 'Flat 53 bathroom ready early; split the gang',
  'targets', jsonb_build_array(jsonb_build_object('work_area_id', :'bath52', 'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000001')),
    jsonb_build_object('work_area_id', :'flat53', 'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000002'))))) as split_ids \gset
select (select id from public.actual_allocations where previous_allocation_id = :'s1' and work_area_id = :'bath52') as s2,
  (select id from public.actual_allocations where previous_allocation_id = :'s1' and work_area_id = :'flat53') as s3 \gset
select test.assert(cardinality(public.reallocate_actual_allocation('c8000000-0000-0000-0000-000000000003', :'s1', jsonb_build_object('at', pg_temp.iso(:'t1030'),
  'reason', 'Flat 53 bathroom ready early; split the gang',
  'targets', jsonb_build_array(jsonb_build_object('work_area_id', :'bath52', 'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000001')),
    jsonb_build_object('work_area_id', :'flat53', 'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000002')))))) = 2
  and (select count(*) = 2 from public.actual_allocations where previous_allocation_id = :'s1'), 'retrying a split returns the same two allocations');
select test.assert((select ended_at = :'t1030'::timestamptz and ended_by = auth.uid() and work_area_id = :'flat52' and deviations = array['operatives_changed']
  from public.actual_allocations where id = :'s1'), 'the morning allocation is ended at the split time and otherwise unchanged');
select test.assert((select deviations = array['operatives_changed'] and work_package_id = 'c6000000-0000-0000-0000-000000000001' and planned_allocation_id = :'plan_smith'
  from public.actual_allocations where id = :'s2'), 'staying inside the planned flat is not a location change, and keeps the plan and package');
select test.assert((select deviations @> array['location_changed','package_changed'] and work_package_id is null and team_id = 'c5000000-0000-0000-0000-000000000001'
  from public.actual_allocations where id = :'s3'), 'moving to another flat is flagged and does not carry the Flat 52 package');

-- 11:00 a replacement joins Sam; 13:00 Jones move to the Flat 52 kitchen; 14:00 Kim leaves.
select test.expect_error(format($q$select public.add_allocation_operative(%L, 'c4000000-0000-0000-0000-000000000012', %L::timestamptz, null)$q$, :'s2', :'t1100'),
  array['22023'], 'adding someone to a confirmed allocation needs a note');
select public.add_allocation_operative(:'s2', 'c4000000-0000-0000-0000-000000000012', pg_temp.iso(:'t1100')::timestamptz, 'Replacement for Lee (sick)') as replacement_row \gset
select test.assert(public.add_allocation_operative(:'s2', 'c4000000-0000-0000-0000-000000000012', null, 'Retry') = :'replacement_row', 'retrying an added operative is safe');
select public.reallocate_actual_allocation(gen_random_uuid(), :'j1', jsonb_build_object('at', pg_temp.iso(:'t1300'), 'reason', 'Flat 55 screed still wet',
  'targets', jsonb_build_array(jsonb_build_object('work_area_id', :'kitchen52'))));
select id as j2 from public.actual_allocations where previous_allocation_id = :'j1' \gset
select test.assert((select count(*) = 2 from public.actual_allocation_operatives where actual_allocation_id = :'j2'), 'a single-destination move takes everyone present by default');
select public.record_operative_departure(:'j2', 'c4000000-0000-0000-0000-000000000005', pg_temp.iso(:'t1400')::timestamptz, 'Left for dentist');
select public.record_operative_departure(:'j2', 'c4000000-0000-0000-0000-000000000005', pg_temp.iso(:'t1400')::timestamptz, 'Retry');
select test.expect_error(format($q$select public.record_operative_departure(%L, 'c4000000-0000-0000-0000-000000000005', pg_temp.iso(%L)::timestamptz, null)$q$, :'j2', :'t1600'),
  array['23514'], 'a recorded departure time cannot be silently changed');
select test.assert((select left_at = :'t1400'::timestamptz and left_recorded_by = auth.uid() and departure_note = 'Left for dentist'
  from public.actual_allocation_operatives where actual_allocation_id = :'j2' and operative_id = 'c4000000-0000-0000-0000-000000000005'),
  'an individual departure is recorded without ending the gang''s allocation');

select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000002"}', true);
select test.expect_error(format($q$select public.archive_location(%L, (select version from public.work_areas where id = %L), 'Omitted by variation')$q$, :'flat52', :'flat52'),
  array['23514'], 'a location with open work cannot be archived');
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000003"}', true);

-- 16:00 the day ends. Repeating an end is a safe retry; a different time is refused.
select public.end_actual_allocation(a, :'t1600'::timestamptz) from unnest(array[:'s2', :'s3', :'j2', :'d1']::uuid[]) a;
select public.end_actual_allocation(:'s2', :'t1600'::timestamptz);
select test.expect_error(format($q$select public.end_actual_allocation(%L, %L::timestamptz)$q$, :'s2', :'t1400'),
  array['23514'], 'an ended allocation cannot be re-timed');
select test.assert((select count(*) = 0 from public.actual_allocations where contract_id = 'c3000000-0000-0000-0000-000000000001' and ended_at is null and voided_at is null),
  'every allocation for the apartment day is closed');

-- Flat 52 bathroom: adhesive found in the grout joints. Who was assigned to the work?
select test.assert((select count(*) = 2 from public.location_work_history(:'bath52', :'t0800', :'t1600')),
  'attribution for the bathroom returns exactly the two allocations that covered it');
select test.assert((select team_name = 'Smith Tiling' and contractor_name = 'Smith Tiling Ltd' and team_lead = 'Sam Smith' and location_relation = 'exact'
  and operative_names = array['Sam Smith','Replacement Labourer'] and stage = 'installation'
  from public.location_work_history(:'bath52', :'t0800', :'t1600') where actual_allocation_id = :'s2'),
  'the bathroom allocation shows the team, contractor, lead at the time, every person present and the stage');
select test.assert((select location_relation = 'containing' and operative_names = array['Sam Smith','Tom Baker']
  from public.location_work_history(:'bath52', :'t0800', :'t1600') where actual_allocation_id = :'s1'),
  'the flat-wide morning allocation is included because it covered the bathroom');
select test.assert((select count(*) = 0 from public.location_work_history(:'bath52') where team_name in ('Jones Installations','Direct Team A')),
  'Jones in the neighbouring kitchen and the voided Flat 56 record are not suggested for the bathroom');
select test.assert((select array_agg(location_relation order by started_at, location_relation) = array['exact','within','within']
  from public.location_work_history(:'flat52')), 'a defect raised at flat level considers everything recorded within the flat');
select test.assert((select count(*) = 1 from public.location_work_history(:'bath52', :'t1100', :'t1300')),
  'a narrower time window narrows the candidates');
-- Once the gang is linked to a company record, attribution takes the
-- contractor name from that record rather than the text typed on the team.
reset role;
insert into public.subcontractor_companies(id, organisation_id, name) values
  ('c9000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'Smith Tiling Group Ltd');
update public.teams set company_id = 'c9000000-0000-0000-0000-000000000001' where id = 'c5000000-0000-0000-0000-000000000001';
set local role authenticated;
select test.assert((select contractor_name = 'Smith Tiling Group Ltd' and team_name = 'Smith Tiling'
  from public.location_work_history(:'bath52', :'t0800', :'t1600') where actual_allocation_id = :'s2'),
  'attribution names the contractor from the linked company record');

-- Office revises the Smith plan; history keeps the original.
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000002"}', true);
select public.plan_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001', 'supersedes_id', :'plan_smith',
  'work_area_id', :'level5', 'team_id', 'c5000000-0000-0000-0000-000000000001', 'stage', 'installation',
  'planned_start', (:'day'::date + 1)::text, 'planned_end', (:'day'::date + 5)::text)) as plan_smith_v2 \gset
select test.assert((select superseded_by = :'plan_smith_v2'::uuid and work_area_id = :'flat52' and cancelled_at is null from public.planned_allocations where id = :'plan_smith'),
  'the original plan is kept unchanged except for a link to its revision');
select test.assert((select count(*) = 3 from public.actual_allocations where planned_allocation_id = :'plan_smith'),
  'actual allocations still reference the plan that was in force when they were confirmed');
select test.expect_error(format($q$select public.plan_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001', 'supersedes_id', %L,
  'work_area_id', %L, 'team_id', 'c5000000-0000-0000-0000-000000000001', 'stage', 'installation', 'planned_start', %L))$q$, :'plan_smith', :'flat53', :'day'),
  array['40001'], 'an already-revised plan cannot be revised again from a stale screen');
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000003"}', true);
select test.expect_error(format($q$select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'planned_allocation_id', %L, 'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000003'), 'reason', 'Stale screen'))$q$, :'plan_smith'),
  array['40001'], 'a supervisor cannot confirm against a plan the office has since revised');

-- Scenario C: hospital. Two teams overlap in Room 12 and its ensuite at different stages.
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000002"}', true);
select public.plan_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000003', 'work_area_id', :'room12',
  'team_id', 'c5000000-0000-0000-0000-000000000005', 'stage', 'installation', 'planned_start', :'day')) as plan_ward \gset
select public.plan_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000003', 'work_area_id', :'ensuite',
  'team_id', 'c5000000-0000-0000-0000-000000000006', 'stage', 'waterproofing', 'planned_start', :'day')) as plan_wet \gset
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000003"}', true);
select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000003', 'planned_allocation_id', :'plan_ward',
  'started_at', pg_temp.iso(:'t0800'), 'ended_at', pg_temp.iso(:'t1600'), 'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000010')));
select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000003', 'planned_allocation_id', :'plan_wet',
  'started_at', pg_temp.iso(:'t0800'), 'ended_at', pg_temp.iso(:'t1300'), 'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000011')));
select test.assert((select array_agg(team_name || ':' || stage || ':' || location_relation order by team_name) =
  array['Ward Team:installation:containing','Wet Area Specialists:waterproofing:exact'] from public.location_work_history(:'ensuite')),
  'Scenario C: ensuite attribution separates the overlapping teams by stage and location');
select test.expect_error(format($q$select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000003',
  'work_area_id', %L, 'stage', 'installation', 'started_at', pg_temp.iso(%L), 'reason', 'Borrowed from Block B',
  'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000006')))$q$, :'room12', :'t1100'),
  array['23P01'], 'an operative already recorded on another site at that time cannot be recorded here too');
select test.expect_error(format($q$select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000003',
  'work_area_id', %L, 'stage', 'installation', 'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000006')))$q$, :'room12'),
  array['22023'], 'unplanned work requires a reason');

-- Cancellation, whole-team absence and future plans.
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000002"}', true);
select public.plan_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001', 'work_area_id', :'flat56',
  'team_id', 'c5000000-0000-0000-0000-000000000003', 'stage', 'grouting', 'planned_start', :'day')) as plan_cancelled \gset
select public.cancel_planned_allocation(:'plan_cancelled', 'Grout delivery delayed');
select public.cancel_planned_allocation(:'plan_cancelled', 'Retry of the same cancellation');
select test.assert((select cancelled_by = auth.uid() and cancel_reason = 'Grout delivery delayed' from public.planned_allocations where id = :'plan_cancelled'),
  'a cancelled plan keeps who cancelled it and why; repeating the cancellation is a safe retry');
select public.plan_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001', 'work_area_id', :'flat56',
  'team_id', 'c5000000-0000-0000-0000-000000000004', 'stage', 'protection', 'planned_start', :'day')) as plan_no_show \gset
select public.plan_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001', 'work_area_id', :'flat56',
  'team_id', 'c5000000-0000-0000-0000-000000000004', 'stage', 'protection', 'planned_start', (private.site_today() + 7)::text));
select test.expect_error(format($q$select public.archive_location(%L, (select version from public.work_areas where id = %L), 'Omitted by variation')$q$, :'flat56', :'flat56'),
  array['23514'], 'a location with future planned work cannot be archived');
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000003"}', true);
select test.expect_error(format($q$select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'planned_allocation_id', %L, 'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000007'), 'reason', 'Turned up anyway'))$q$, :'plan_cancelled'),
  array['40001'], 'work cannot be confirmed against a cancelled plan');
select public.record_allocation_absence(gen_random_uuid(), jsonb_build_object('planned_allocation_id', :'plan_no_show', 'work_date', :'day',
  'reason', 'Team redeployed by their company without notice')) as team_absent \gset
select test.expect_error(format($q$select public.record_allocation_absence(gen_random_uuid(), jsonb_build_object('planned_allocation_id', %L, 'work_date', %L, 'reason', 'Recorded twice'))$q$,
  :'plan_no_show', :'day'), array['23505'], 'a team cannot be recorded absent twice for the same day');
select test.expect_error(format($q$select public.record_allocation_absence(gen_random_uuid(), jsonb_build_object('planned_allocation_id', %L, 'work_date', %L, 'reason', 'Known holiday'))$q$,
  :'plan_no_show', (private.site_today() + 1)::text), array['22023'], 'absence cannot be recorded for a future day');
select public.void_allocation_absence(:'team_absent', 'Recorded against the wrong plan');
select public.void_allocation_absence(:'team_absent', 'Retry of the same void');
select test.assert((select operative_id is null and voided_by = auth.uid() and void_reason = 'Recorded against the wrong plan' from public.allocation_absences where id = :'team_absent'),
  'a whole-team absence is recorded and, when wrong, voided with who and why');

-- Permissions, ownership and history protection.
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000003"}', true);
select test.expect_error(format($q$select public.plan_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'work_area_id', %L, 'team_id', 'c5000000-0000-0000-0000-000000000002', 'stage', 'installation', 'planned_start', %L))$q$, :'flat55', :'day'),
  array['42501'], 'a supervisor cannot create office plans');
select test.expect_error(format($q$select public.cancel_planned_allocation(%L, 'Supervisor cancelling')$q$, :'plan_jones'),
  array['42501'], 'a supervisor cannot cancel office plans');
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000004"}', true);
select test.assert((select count(*) = 0 from public.actual_allocations where contract_id <> 'c3000000-0000-0000-0000-000000000001')
  and (select count(*) > 0 from public.actual_allocations), 'a supervisor sees allocations only for their own sites');
select test.expect_error(format($q$select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000002',
  'work_area_id', %L, 'stage', 'installation', 'reason', 'Not my site', 'operative_ids', jsonb_build_array('c4000000-0000-0000-0000-000000000008')))$q$, :'sales'),
  array['42501'], 'a supervisor cannot record allocations on a site they are not assigned to');
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000005"}', true);
select test.assert((select count(*) = 0 from public.actual_allocations) and (select count(*) = 0 from public.planned_allocations)
  and (select count(*) = 0 from public.location_work_history(:'bath52')), 'an unassigned supervisor sees no allocations or attribution');
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000007"}', true);
select test.expect_error(format($q$select public.plan_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'c3000000-0000-0000-0000-000000000001',
  'work_area_id', %L, 'team_id', 'c5000000-0000-0000-0000-000000000002', 'stage', 'installation', 'planned_start', %L))$q$, :'flat55', :'day'),
  array['42501'], 'a manager cannot plan work on a contract they are not allocated to');
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000006"}', true);
select test.assert((select count(*) = 0 from public.actual_allocations) and (select count(*) = 0 from public.planned_allocations)
  and (select count(*) = 0 from public.allocation_absences) and (select count(*) = 0 from public.location_work_history(:'bath52')),
  'an installer cannot read allocation or attribution records in Phase 1');
select test.expect_error(format($q$select public.end_actual_allocation(%L)$q$, :'showroom'), array['42501'], 'an installer cannot end allocations');
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000008"}', true);
select test.assert((select count(*) = 0 from public.actual_allocations), 'another company cannot see these allocations');
select test.expect_error(format($q$select public.void_actual_allocation(%L, 'Cross-tenant void attempt')$q$, :'s2'), array['42501'], 'another company cannot void an allocation');
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000003"}', true);
select test.expect_error(format($q$update public.actual_allocations set work_area_id = %L where id = %L$q$, :'kitchen52', :'s2'),
  array['42501'], 'allocations cannot be edited through the table API');
select test.expect_error($q$insert into public.actual_allocations(organisation_id, contract_id, work_area_id, stage, work_date, started_at)
  values ('c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', gen_random_uuid(), 'installation', current_date, now())$q$,
  array['42501'], 'allocations cannot be inserted through the table API');
select test.assert((select array_agg(action order by id) = array['insert','update'] and bool_and(actor_id = auth.uid())
  from public.audit_events where entity_type = 'actual_allocations' and entity_id = :'s1'),
  'confirming and then splitting an allocation are each audited once with the genuine actor, visible to the site team');
reset role;
select test.expect_error(format($q$update public.actual_allocations set team_id = 'c5000000-0000-0000-0000-000000000002' where id = %L$q$, :'s2'),
  array['42501'], 'recorded attribution cannot be rewritten even by privileged SQL');
select test.expect_error(format($q$delete from public.actual_allocations where id = %L$q$, :'d_wrong'),
  array['42501'], 'voided allocations cannot be deleted even by privileged SQL');
select test.expect_error(format($q$update public.planned_allocations set work_area_id = %L where id = %L$q$, :'flat53', :'plan_smith'),
  array['42501'], 'a superseded plan cannot be rewritten even by privileged SQL');
select test.assert(true, 'planned and actual allocations and attribution PASSED');
rollback;
