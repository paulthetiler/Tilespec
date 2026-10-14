-- End-to-end fixture for the supervisor's daily workforce. Fictional people
-- and companies on a disposable local database only; never apply to a hosted
-- project. Records are created through the real database functions as the
-- office manager, exactly as the office screens would create them.
begin;
insert into auth.users(id, email) values
  ('e2e00000-0000-4000-8000-000000000001', 'sid.supervisor@e2e.invalid'),
  ('e2e00000-0000-4000-8000-000000000002', 'mia.manager@e2e.invalid'),
  ('e2e00000-0000-4000-8000-000000000003', 'oscar.other@e2e.invalid');
insert into public.organisations(id, name) values
  ('e2e00000-0000-4000-8000-0000000000a1', 'E2E Tiling Contractors'), ('e2e00000-0000-4000-8000-0000000000a2', 'Another Contractor');
insert into public.organisation_members(organisation_id, user_id, display_name, role, financial_access) values
  ('e2e00000-0000-4000-8000-0000000000a1', 'e2e00000-0000-4000-8000-000000000001', 'Sid Supervisor', 'supervisor', false),
  ('e2e00000-0000-4000-8000-0000000000a1', 'e2e00000-0000-4000-8000-000000000002', 'Mia Manager', 'contracts_manager', false),
  ('e2e00000-0000-4000-8000-0000000000a2', 'e2e00000-0000-4000-8000-000000000003', 'Oscar Other', 'supervisor', false);
insert into public.contracts(id, organisation_id, reference, name, address, created_by) values
  ('e2e00000-0000-4000-8000-0000000000c1', 'e2e00000-0000-4000-8000-0000000000a1', 'APT-B', 'Riverside apartments Block B', '1 Riverside Way, Leeds', 'e2e00000-0000-4000-8000-000000000002'),
  ('e2e00000-0000-4000-8000-0000000000c2', 'e2e00000-0000-4000-8000-0000000000a2', 'OTHER-1', 'Another contractor site', '', 'e2e00000-0000-4000-8000-000000000003');
insert into public.contract_assignments(contract_id, organisation_id, user_id) values
  ('e2e00000-0000-4000-8000-0000000000c1', 'e2e00000-0000-4000-8000-0000000000a1', 'e2e00000-0000-4000-8000-000000000001'),
  ('e2e00000-0000-4000-8000-0000000000c1', 'e2e00000-0000-4000-8000-0000000000a1', 'e2e00000-0000-4000-8000-000000000002'),
  ('e2e00000-0000-4000-8000-0000000000c2', 'e2e00000-0000-4000-8000-0000000000a2', 'e2e00000-0000-4000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2e00000-0000-4000-8000-000000000002"}', true);
select public.create_locations('e2e00000-0000-4000-8000-0000000000c1', gen_random_uuid(), null, jsonb_build_array(
  jsonb_build_object('name', 'Block B', 'children', jsonb_build_array(jsonb_build_object('name', 'Level 5', 'children',
    (select jsonb_agg(jsonb_build_object('name', 'Flat ' || n, 'location_type', 'Flat', 'children', jsonb_build_array(jsonb_build_object('name', 'Bathroom'), jsonb_build_object('name', 'Kitchen'))))
     from generate_series(51, 59) n)))),
  jsonb_build_object('name', 'Communal corridors', 'children', jsonb_build_array(jsonb_build_object('name', 'Corridor 1'), jsonb_build_object('name', 'Corridor 2')))));
create temporary table e2e_ids(name text primary key, id uuid) on commit drop;
insert into e2e_ids select 'company:' || name, public.create_company(gen_random_uuid(), jsonb_build_object('name', name))
  from unnest(array['Smith Tiling Ltd', 'Jones Installations', 'Moss Tiling', 'Wet Area Specialists']) name;
select public.record_company_insurance(gen_random_uuid(), jsonb_build_object('company_id', (select id from e2e_ids where name = 'company:Smith Tiling Ltd'),
  'insurance_type', 'employers_liability', 'expires_on', (private.site_today() - 3)::text));
insert into e2e_ids select 'person:' || name, public.create_operative(gen_random_uuid(), jsonb_build_object('display_name', name, 'engagement', engagement,
  'company_id', (select id from e2e_ids where name = 'company:' || company)))
from (values ('Sam Smith', 'subcontractor', 'Smith Tiling Ltd'), ('Tom Baker', 'subcontractor', 'Smith Tiling Ltd'), ('Lee Hart', 'subcontractor', 'Smith Tiling Ltd'),
  ('Max Reed', 'subcontractor', 'Smith Tiling Ltd'), ('Jo Jones', 'subcontractor', 'Jones Installations'), ('Kim Lowe', 'subcontractor', 'Jones Installations'),
  ('Pat Moss', 'subcontractor', 'Jones Installations'), ('Ray Dunn', 'subcontractor', 'Moss Tiling'), ('Ben Ward', 'subcontractor', 'Moss Tiling'),
  ('Dan Price', 'direct_employee', null), ('Eve Shaw', 'direct_employee', null), ('Ian Cole', 'direct_employee', null), ('Uma Bell', 'direct_employee', null),
  ('Ali Khan', 'subcontractor', 'Jones Installations'), ('Zak Hill', 'subcontractor', 'Jones Installations'), ('Nia Fox', 'subcontractor', 'Wet Area Specialists')) p(name, engagement, company);
insert into e2e_ids select 'team:' || name, public.create_team(gen_random_uuid(), jsonb_build_object('name', name, 'kind', kind, 'company_id', (select id from e2e_ids where name = 'company:' || company)))
from (values ('Smith Tiling', 'subcontract_gang', 'Smith Tiling Ltd'), ('Jones Installations', 'subcontract_gang', 'Jones Installations'),
  ('Direct Team A', 'direct_team', null), ('Moss Pair', 'subcontract_gang', 'Moss Tiling'), ('Hart Gang', 'subcontract_gang', 'Jones Installations'),
  ('Wet Area Team', 'individual_subcontractor', 'Wet Area Specialists')) t(name, kind, company);
select count(*) from (select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', (select id from e2e_ids where name = 'team:' || team),
  'operative_id', (select id from e2e_ids where name = 'person:' || person), 'is_lead', lead, 'valid_from', (private.site_today() - 30)::text))
from (values ('Smith Tiling', 'Sam Smith', true), ('Smith Tiling', 'Tom Baker', false), ('Smith Tiling', 'Lee Hart', false), ('Smith Tiling', 'Max Reed', false),
  ('Jones Installations', 'Jo Jones', true), ('Jones Installations', 'Kim Lowe', false), ('Jones Installations', 'Pat Moss', false),
  ('Direct Team A', 'Dan Price', true), ('Direct Team A', 'Eve Shaw', false), ('Direct Team A', 'Ian Cole', false), ('Direct Team A', 'Uma Bell', false),
  ('Moss Pair', 'Ray Dunn', true), ('Moss Pair', 'Ben Ward', false), ('Hart Gang', 'Ali Khan', true), ('Hart Gang', 'Zak Hill', false),
  ('Wet Area Team', 'Nia Fox', true)) m(team, person, lead)) members;
select count(*) from (select public.plan_allocation(gen_random_uuid(), jsonb_build_object('contract_id', 'e2e00000-0000-4000-8000-0000000000c1',
  'work_area_id', (select id from public.work_areas where name = area and contract_id = 'e2e00000-0000-4000-8000-0000000000c1'),
  'team_id', (select id from e2e_ids where name = 'team:' || team), 'stage', stage, 'planned_start', (private.site_today() - 1)::text, 'planned_end', (private.site_today() + 3)::text,
  'operative_ids', (select jsonb_agg(id) from e2e_ids where name = any(people)), 'instructions', instructions))
from (values ('Smith Tiling', 'Flat 52', 'installation', array['person:Sam Smith', 'person:Tom Baker', 'person:Lee Hart', 'person:Max Reed'], 'Bathroom first; protect the bath panel'),
  ('Jones Installations', 'Flat 55', 'installation', array['person:Jo Jones', 'person:Kim Lowe', 'person:Pat Moss'], ''),
  ('Direct Team A', 'Communal corridors', 'preparation', array['person:Dan Price', 'person:Eve Shaw', 'person:Ian Cole', 'person:Uma Bell'], 'Prime both corridors'),
  ('Moss Pair', 'Flat 54', 'grouting', array['person:Ray Dunn', 'person:Ben Ward'], ''),
  ('Hart Gang', 'Flat 57', 'installation', array['person:Ali Khan', 'person:Zak Hill'], '')) p(team, area, stage, people, instructions)) plans;
commit;
