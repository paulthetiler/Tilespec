-- Hierarchical work locations: apartment block and hospital structures.
-- Disposable local database only; permission assertions run as non-superusers.
begin;

insert into auth.users(id, email) values
  ('f1000000-0000-0000-0000-000000000001', 'loc-owner@example.invalid'),
  ('f1000000-0000-0000-0000-000000000002', 'loc-manager@example.invalid'),
  ('f1000000-0000-0000-0000-000000000003', 'loc-supervisor@example.invalid'),
  ('f1000000-0000-0000-0000-000000000004', 'loc-installer-52@example.invalid'),
  ('f1000000-0000-0000-0000-000000000005', 'loc-installer-53@example.invalid'),
  ('f1000000-0000-0000-0000-000000000006', 'loc-unallocated-manager@example.invalid'),
  ('f1000000-0000-0000-0000-000000000007', 'loc-other-owner@example.invalid');
insert into public.organisations(id, name) values
  ('f2000000-0000-0000-0000-000000000001', 'Locations fixture company'),
  ('f2000000-0000-0000-0000-000000000002', 'Unrelated company');
insert into public.organisation_members(organisation_id, user_id, display_name, role, financial_access) values
  ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Owner', 'owner', true),
  ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002', 'Manager', 'contracts_manager', false),
  ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000003', 'Supervisor', 'supervisor', false),
  ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000004', 'Installer Flat 52', 'subcontract_installer', false),
  ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000005', 'Installer Flat 53', 'lead_installer', false),
  ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000006', 'Other Manager', 'contracts_manager', false),
  ('f2000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000007', 'Other Owner', 'owner', true);
insert into public.contracts(id, organisation_id, reference, name, created_by) values
  ('f3000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'APT-001', 'Riverside apartments', 'f1000000-0000-0000-0000-000000000001'),
  ('f3000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000001', 'HOSP-002', 'General hospital refurbishment', 'f1000000-0000-0000-0000-000000000001');
insert into public.contract_assignments(contract_id, organisation_id, user_id) values
  ('f3000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002'),
  ('f3000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000003');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000002"}', true);
select cardinality(public.create_locations('f3000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000001', null,
  '[{"name":"Block B","location_type":"Block","code":"B","children":[{"name":"Level 5","location_type":"Level","children":[
     {"name":"Flat 51","location_type":"Flat","children":[{"name":"Bathroom"},{"name":"Kitchen"}]},
     {"name":"Flat 52","location_type":"Flat","children":[{"name":"Bathroom"},{"name":"Kitchen"}]},
     {"name":"Flat 53","location_type":"Flat","children":[{"name":"Bathroom"},{"name":"Kitchen"}]},
     {"name":"Flat 54","location_type":"Flat","children":[{"name":"Bathroom"},{"name":"Kitchen"}]}]}]}]')) as created \gset
select test.assert(:created = 14, 'allocated manager creates a nested block/level/flat/room hierarchy in one request');
select test.assert((select cardinality(public.create_locations('f3000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000001', null,
  '[{"name":"Block B","location_type":"Block","code":"B","children":[{"name":"Level 5","location_type":"Level","children":[
     {"name":"Flat 51","location_type":"Flat","children":[{"name":"Bathroom"},{"name":"Kitchen"}]},
     {"name":"Flat 52","location_type":"Flat","children":[{"name":"Bathroom"},{"name":"Kitchen"}]},
     {"name":"Flat 53","location_type":"Flat","children":[{"name":"Bathroom"},{"name":"Kitchen"}]},
     {"name":"Flat 54","location_type":"Flat","children":[{"name":"Bathroom"},{"name":"Kitchen"}]}]}]}]')) = 14)
  and (select count(*) = 14 from public.work_areas where contract_id = 'f3000000-0000-0000-0000-000000000001'),
  'retrying the same bulk request returns the same locations and creates no duplicates');
select test.expect_error($q$select public.create_locations('f3000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000001', null, '[{"name":"Block C"}]')$q$,
  array['22023'], 'a request key cannot be reused for different locations');
select test.assert((select count(*) = 14 from public.audit_events where entity_type = 'work_areas' and action = 'insert'
  and contract_id = 'f3000000-0000-0000-0000-000000000001' and actor_id = auth.uid()), 'every created location is audited with the genuine actor');

select id as block, version as block_version from public.work_areas where name = 'Block B' \gset
select id as level5 from public.work_areas where name = 'Level 5' \gset
select id as flat52, version as flat52_version from public.work_areas where name = 'Flat 52' \gset
select id as flat53, version as flat53_version from public.work_areas where name = 'Flat 53' \gset
select id as flat54, version as flat54_version from public.work_areas where name = 'Flat 54' \gset
select id as bath52 from public.work_areas where name = 'Bathroom' and parent_id = :'flat52' \gset
select id as kitchen52 from public.work_areas where name = 'Kitchen' and parent_id = :'flat52' \gset
select id as bath54 from public.work_areas where name = 'Bathroom' and parent_id = :'flat54' \gset
select test.assert((select path_ids = array[:'block', :'level5', :'flat52', :'bath52']::uuid[] from public.work_areas where id = :'bath52'),
  'a room records its full ancestry: Block B > Level 5 > Flat 52 > Bathroom');
select test.assert((select location_type = 'Block' and code = 'B' from public.work_areas where id = :'block'), 'level labels are office data, not hardcoded room names');

select test.expect_error($q$select public.create_locations('f3000000-0000-0000-0000-000000000001', gen_random_uuid(), (select id from public.work_areas where name = 'Level 5'), '[{"name":" flat 52 "}]')$q$,
  array['23505'], 'a second active location with the same name under one parent is rejected');
select test.expect_error($q$select public.create_locations('f3000000-0000-0000-0000-000000000001', gen_random_uuid(), null,
  '[{"name":"L1","children":[{"name":"L2","children":[{"name":"L3","children":[{"name":"L4","children":[{"name":"L5","children":[{"name":"L6","children":[{"name":"L7","children":[{"name":"L8","children":[{"name":"L9"}]}]}]}]}]}]}]}]}]')$q$,
  array['23514'], 'hierarchies deeper than 8 levels are rejected');
select test.assert((select count(*) = 14 from public.work_areas where contract_id = 'f3000000-0000-0000-0000-000000000001'),
  'a rejected bulk request leaves no partial locations behind');
select test.expect_error(format($q$select public.create_locations('f3000000-0000-0000-0000-000000000001', gen_random_uuid(), null, %L)$q$,
  (select jsonb_agg(jsonb_build_object('name', 'Room ' || g)) from generate_series(1, 2001) g)),
  array['22023'], 'a single request is bounded to 2,000 locations');
select test.expect_error($q$select public.create_locations('f3000000-0000-0000-0000-000000000001', gen_random_uuid(), null, '[{"name":"Plant room","colour":"red"}]')$q$,
  array['22023'], 'unknown location fields are rejected rather than ignored');
select test.expect_error($q$select public.create_locations('f3000000-0000-0000-0000-000000000002', gen_random_uuid(), null, '[{"name":"Ward 4"}]')$q$,
  array['42501'], 'a manager cannot create locations on a contract they are not allocated to');

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000001"}', true);
select public.create_locations('f3000000-0000-0000-0000-000000000002', 'f4000000-0000-0000-0000-000000000002', null,
  '[{"name":"Building A","children":[{"name":"Ward 4","location_type":"Ward","children":[{"name":"Room 12","children":[{"name":"Ensuite"}]}]}]}]');
select id as ward4 from public.work_areas where name = 'Ward 4' \gset
select test.expect_error(format($q$select public.create_locations('f3000000-0000-0000-0000-000000000001', gen_random_uuid(), %L, '[{"name":"Misplaced room"}]')$q$, :'ward4'),
  array['23503'], 'a location cannot be created under a parent from another contract');
select test.expect_error(format($q$select public.update_location(%L, %s, jsonb_build_object('parent_id', %L))$q$, :'flat54', :flat54_version, :'ward4'),
  array['23514'], 'a location cannot be moved into another contract');

-- Rename and move keep IDs and carry the subtree.
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000002"}', true);
select public.create_locations('f3000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000003', :'block', '[{"name":"Level 6","location_type":"Level"}]');
select id as level6 from public.work_areas where name = 'Level 6' \gset
select public.update_location(:'flat54', :flat54_version, jsonb_build_object('parent_id', :'level6', 'name', 'Flat 64', 'code', '64')) as flat54_next \gset
select test.assert((select path_ids = array[:'block', :'level6', :'flat54', :'bath54']::uuid[] from public.work_areas where id = :'bath54'),
  'moving a flat carries its rooms with unchanged IDs');
select test.assert((select count(*) = 1 from public.audit_events where entity_id = :'flat54' and action = 'update'
  and details->'changed_fields' ? 'parent_id' and details->'changed_fields' ? 'name' and actor_id = auth.uid()),
  'a move and rename is audited once against the moved location with the genuine actor');
select test.assert((select count(*) = 0 from public.audit_events where entity_id = :'bath54' and action = 'update'),
  'descendants'' derived path rewrite does not create misleading per-room edit events');
select test.expect_error(format($q$select public.update_location(%L, %s, '{"name":"Stale"}')$q$, :'flat54', :flat54_version),
  array['40001'], 'a stale location edit is rejected');
select test.expect_error(format($q$select public.update_location(%L, %s, jsonb_build_object('parent_id', %L))$q$, :'level5',
  (select version from public.work_areas where id = :'level5'), :'flat52'),
  array['23514'], 'a location cannot be moved inside its own descendant');
select test.expect_error(format($q$select public.update_location(%L, %s, '{"name":""}')$q$, :'flat52', :flat52_version),
  array['22023'], 'a location name cannot be blanked');

-- Supervisors and installers record against locations; they do not restructure them.
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000003"}', true);
select test.assert((select count(*) = 15 from public.work_areas), 'allocated supervisor sees every location on their contract only');
select test.expect_error($q$select public.create_locations('f3000000-0000-0000-0000-000000000001', gen_random_uuid(), null, '[{"name":"Supervisor area"}]')$q$,
  array['42501'], 'supervisor cannot create locations');
select test.expect_error(format($q$select public.archive_location(%L, %s, 'Supervisor archive')$q$, :'flat52', :flat52_version),
  array['42501'], 'supervisor cannot archive locations');
select test.expect_error($q$insert into public.work_areas(organisation_id, contract_id, name) values ('f2000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'Direct insert')$q$,
  array['42501'], 'locations cannot be written directly through the table API');
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000006"}', true);
select test.assert((select count(*) = 0 from public.work_areas), 'unallocated manager cannot see the hierarchy');
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000007"}', true);
select test.assert((select count(*) = 0 from public.work_areas), 'another company cannot see the hierarchy');
select test.expect_error(format($q$select public.update_location(%L, 1, '{"name":"Cross-tenant"}')$q$, :'flat52'),
  array['42501'], 'another company cannot edit a location');
reset role;

-- Installer access remains package-derived; the hierarchy only adds context rows.
insert into public.work_packages(id, organisation_id, contract_id, work_area_id, name, quantity, unit) values
  ('f5000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', :'bath52', 'Flat 52 bathroom wall tiling', 18, 'm2'),
  ('f5000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', :'flat53', 'Flat 53 full fit-out tiling', 42, 'm2');
insert into public.package_assignments(organisation_id, contract_id, work_package_id, user_id) values
  ('f2000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000004'),
  ('f2000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000005');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000004"}', true);
select test.assert((select array_agg(name order by cardinality(path_ids)) = array['Block B','Level 5','Flat 52','Bathroom'] from public.work_areas),
  'room installer sees the ancestry of their allocated room and nothing else');
select test.assert((select count(*) = 0 from public.work_areas where id = :'kitchen52'), 'room installer cannot see the neighbouring kitchen in the same flat');
select test.assert((select count(*) = 1 from public.work_packages), 'room installer still sees only their own package');
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000005"}', true);
select test.assert((select count(*) = 5 from public.work_areas) and (select count(*) = 0 from public.work_areas where name in ('Flat 51','Flat 52')),
  'flat-wide installer sees their flat''s ancestry and rooms but not other flats');

-- Archiving retires a subtree from new work without deleting history.
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000002"}', true);
select test.expect_error(format($q$select public.archive_location(%L, %s, 'no')$q$, :'flat53', :flat53_version),
  array['22023'], 'archiving requires a meaningful reason');
select test.assert((select public.archive_location(:'flat53', :flat53_version, 'Flat omitted from tiling scope by variation') = 3),
  'archiving a flat archives the flat and its rooms');
select test.assert((select count(*) = 15 from public.work_areas) and (select count(*) = 3 from public.work_areas where archived_at is not null and archived_by = auth.uid()),
  'archived locations remain readable with the archiving actor recorded');
select test.expect_error(format($q$select public.create_locations('f3000000-0000-0000-0000-000000000001', gen_random_uuid(), %L, '[{"name":"Utility"}]')$q$, :'flat53'),
  array['23514'], 'new locations cannot be added inside an archived location');
select test.expect_error(format($q$select public.update_location(%L, %s, '{"name":"Flat 53A"}')$q$, :'flat53', :flat53_version + 1),
  array['23514'], 'archived locations cannot be edited');

-- The existing single-area RPC keeps working and creates a top-level location.
select public.create_work_area('f3000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000004', '{"name":"Communal corridors","location":"All levels"}') as communal \gset
select test.assert((select parent_id is null and path_ids = array[id] from public.work_areas where id = :'communal'),
  'the existing work-area RPC still creates a valid top-level location');
reset role;
select test.assert(true, 'hierarchical work locations PASSED');
rollback;
