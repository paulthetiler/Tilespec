-- Real commercial flooring fixtures in a disposable local database only.
-- All permission assertions switch away from the database superuser.
begin;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner@example.invalid'),
  ('00000000-0000-0000-0000-000000000002', 'commercial-manager@example.invalid'),
  ('00000000-0000-0000-0000-000000000003', 'operations-manager@example.invalid'),
  ('00000000-0000-0000-0000-000000000004', 'supervisor@example.invalid'),
  ('00000000-0000-0000-0000-000000000005', 'lead@example.invalid'),
  ('00000000-0000-0000-0000-000000000006', 'north-installer@example.invalid'),
  ('00000000-0000-0000-0000-000000000007', 'south-installer@example.invalid'),
  ('00000000-0000-0000-0000-000000000008', 'unassigned@example.invalid'),
  ('00000000-0000-0000-0000-000000000009', 'inactive@example.invalid'),
  ('00000000-0000-0000-0000-000000000010', 'expired@example.invalid'),
  ('00000000-0000-0000-0000-000000000011', 'future@example.invalid'),
  ('00000000-0000-0000-0000-000000000012', 'other-owner@example.invalid'),
  ('00000000-0000-0000-0000-000000000013', 'roleless@example.invalid');
insert into public.organisations(id, name) values
  ('10000000-0000-0000-0000-000000000001', 'TileSPEC Commercial Flooring'),
  ('10000000-0000-0000-0000-000000000002', 'Separate Flooring Company');
insert into public.organisation_members(organisation_id, user_id, display_name, role, financial_access, active) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Owner', 'owner', true, true),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Commercial Manager', 'contracts_manager', true, true),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'Operations Manager', 'contracts_manager', false, true),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'Supervisor', 'supervisor', false, true),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'North Lead', 'lead_installer', false, true),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006', 'North Installer', 'subcontract_installer', false, true),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000007', 'South Installer', 'subcontract_installer', false, true),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000008', 'Unassigned Supervisor', 'supervisor', false, true),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000009', 'Inactive Installer', 'subcontract_installer', false, true),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Expired Supervisor', 'supervisor', false, true),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Future Supervisor', 'supervisor', false, true),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000012', 'Other Owner', 'owner', true, true);
insert into public.contracts(id, organisation_id, reference, name, client, address, scope, created_by) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'TS-RAIL-001', 'Station concourse flooring', 'Principal Rail Contractor', 'London station', 'Porcelain flooring to north and south concourses', '00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'TS-OFFICE-002', 'Office refurbishment', 'Office Main Contractor', 'London office', 'Reception stone floor', '00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'OTHER-HOTEL-001', 'Other company hotel lobby', 'Hotel Main Contractor', 'Hotel', 'Lobby floor', '00000000-0000-0000-0000-000000000012');
insert into public.contract_commercials(contract_id, organisation_id, contract_value, labour_budget, materials_budget, preliminaries_budget, contingency, target_margin, payment_terms, retention_percent) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 120000, 36000, 28000, 6000, 5000, 30, 'Monthly applications with agreed notices', 3),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 45000, 10000, 16000, 2000, 2000, 30, 'Monthly applications', 0),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 80000, 20000, 30000, 4000, 3000, 30, 'Monthly applications', 3);
insert into public.contract_assignments(contract_id, organisation_id, user_id, valid_from, valid_until) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', current_date, null),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', current_date, null),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', current_date, null),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', current_date - 30, current_date - 1),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', current_date + 1, current_date + 30);
insert into public.work_areas(id, organisation_id, contract_id, name, location, created_by) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'North concourse', 'Drawing A-101 grid N', '00000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'South concourse', 'Drawing A-101 grid S', '00000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Office reception', 'Ground floor', '00000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'Hotel lobby', 'Ground floor', '00000000-0000-0000-0000-000000000012');
insert into public.work_packages(id, organisation_id, contract_id, work_area_id, name, quantity, unit) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'North gang porcelain flooring', 600, 'm2'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'South gang porcelain flooring', 700, 'm2'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'Office stone flooring', 150, 'm2'),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004', 'Hotel stone flooring', 250, 'm2');
insert into public.package_assignments(organisation_id, contract_id, work_package_id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000007'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000009');
update public.organisation_members set active = false where user_id = '00000000-0000-0000-0000-000000000009';

set local role anon;
select test.expect_error('select * from public.contracts', array['42501'], 'anonymous cannot read internal contracts');
select test.expect_error($q$select public.create_contract('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '{"reference":"UNAUTH","name":"Unauthorised"}')$q$, array['42501'], 'anonymous cannot invoke a contract mutation');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000013"}', true);
select test.assert((select count(*) = 0 from public.contracts), 'signed-in user without membership sees no contracts');
select test.assert((select count(*) = 0 from public.contract_commercials), 'role-less user sees no commercial data');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', true);
select test.assert((select count(*) = 2 from public.contracts), 'owner sees own organisation contracts only');
select test.assert((select count(*) = 2 from public.contract_commercials), 'owner sees own commercial records only');
select test.assert((select count(*) = 0 from public.contracts where state <> 'draft'), 'foundation has no fabricated commercial acceptance or installation release');
select test.assert((select count(*) = 0 from public.work_areas where specification_revision <> 'unapproved'), 'new work areas have no fabricated approved specification');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', true);
select test.assert((select count(*) = 1 from public.contracts), 'manager sees allocated contract only');
select test.assert((select count(*) = 1 from public.contract_commercials), 'owner-granted manager sees only allocated commercial records');
select test.expect_error($q$select public.save_member('00000000-0000-0000-0000-000000000006', 'North Installer', 'owner', true, true)$q$, array['42501'], 'manager cannot promote an installer or grant financial access');
with changed as (update public.contract_assignments set valid_until = current_date + 1 where user_id = '00000000-0000-0000-0000-000000000003' returning user_id)
select test.assert((select count(*) = 0 from changed), 'manager cannot alter another manager allocation');
with removed as (delete from public.contract_assignments where user_id = '00000000-0000-0000-0000-000000000003' returning user_id)
select test.assert((select count(*) = 0 from removed), 'manager cannot revoke another manager allocation');
select test.expect_error($q$insert into public.contract_assignments(organisation_id,contract_id,user_id) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',auth.uid())$q$,
  array['42501'], 'manager cannot assign themselves to an unallocated contract');
insert into public.contract_assignments(organisation_id,contract_id,user_id) values
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000008');
select test.assert((select count(*) = 1 from public.contract_assignments where user_id = '00000000-0000-0000-0000-000000000008'), 'allocated manager can assign active operational supervisor');
delete from public.contract_assignments where user_id = '00000000-0000-0000-0000-000000000008';
select test.expect_error($q$insert into public.package_assignments(organisation_id,contract_id,work_package_id,user_id) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004')$q$,
  array['23514'], 'supervisor cannot be allocated as an installer package member');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003"}', true);
select test.assert((select count(*) = 1 from public.contracts), 'manager without finance grant can view allocated operations');
select test.assert((select count(*) = 0 from public.contract_commercials), 'manager without owner grant cannot read financial tables');
select test.expect_error($q$select public.save_contract_commercial('20000000-0000-0000-0000-000000000001', 1, '{"contract_value":1}')$q$, array['42501'], 'manager without finance grant cannot edit commercial details');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000004"}', true);
select test.assert((select count(*) = 1 from public.contracts), 'supervisor sees allocated contract');
select test.assert((select count(*) = 2 from public.work_areas), 'supervisor sees both allocated contract work areas');
select test.assert((select count(*) = 0 from public.contract_commercials), 'supervisor cannot read financial records');
select test.expect_error($q$select public.update_contract('20000000-0000-0000-0000-000000000001', 1, '{"name":"Supervisor edit"}')$q$, array['42501'], 'supervisor cannot silently edit contract scope');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000006"}', true);
select test.assert((select count(*) = 1 from public.contracts), 'installer sees parent contract for allocated package');
select test.assert((select count(*) = 1 from public.work_areas), 'north installer cannot read south gang work area');
select test.assert((select count(*) = 1 from public.work_packages), 'north installer cannot read other gang packages');
select test.assert((select count(*) = 0 from public.contract_commercials), 'subcontractor cannot read selling prices or margins');
select test.expect_error('select target_margin from public.organisations', array['42501'], 'subcontractor cannot read confidential company target margin');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000006","role":"owner","financial_access":true,"organisation_id":"10000000-0000-0000-0000-000000000002"}', true);
select test.assert((select count(*) = 0 from public.contract_commercials), 'fabricated role and financial JWT fields cannot grant commercial authority');
select test.assert((select count(*) = 1 from public.work_packages), 'fabricated organisation JWT field cannot cross contract allocation boundaries');
select test.expect_error($q$select public.save_contract_commercial('20000000-0000-0000-0000-000000000001', 1, '{"contract_value":1}')$q$, array['42501'], 'installer cannot write financial information');
select test.expect_error($q$select public.update_contract('20000000-0000-0000-0000-000000000001', 1, '{"state":"released"}')$q$, array['42501'], 'installer cannot invent contract approval or bypass release');
select test.expect_error($q$update public.organisation_members set role = 'owner', financial_access = true where user_id = auth.uid()$q$, array['42501'], 'installer cannot mutate own role or commercial permissions directly');
select test.expect_error($q$select public.create_work_area('20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', '{"name":"Unauthorised area"}')$q$, array['42501'], 'installer cannot create an unauthorised work area');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000005"}', true);
select test.assert((select count(*) = 1 from public.work_areas), 'lead installer also remains scoped to allocated work');
select test.assert((select count(*) = 0 from public.contract_commercials), 'lead installer receives no commercial visibility');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000008"}', true);
select test.assert((select count(*) = 0 from public.contracts), 'unallocated supervisor receives no contract access');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000009"}', true);
select test.assert((select count(*) = 0 from public.contracts), 'inactive member cannot use an existing package assignment');
select test.assert((select count(*) = 0 from public.work_packages), 'inactive member has no work package access');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000010"}', true);
select test.assert((select count(*) = 0 from public.contracts), 'expired assignment cannot access contract');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000011"}', true);
select test.assert((select count(*) = 0 from public.contracts), 'future assignment cannot access contract early');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000012"}', true);
select test.assert((select count(*) = 1 from public.contracts), 'other organisation owner sees own contract only');
select test.expect_error($q$select public.update_contract('20000000-0000-0000-0000-000000000001', 1, '{"name":"Cross-tenant edit"}')$q$, array['42501'], 'owner cannot edit a different organisation contract');

reset role;
-- Revoke an allocation as trusted fixture administration, then test normal RLS.
delete from public.package_assignments where user_id = '00000000-0000-0000-0000-000000000006';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000006"}', true);
select test.assert((select count(*) = 0 from public.contracts), 'revoked package assignment immediately removes parent contract access');
select test.assert((select count(*) = 0 from public.work_areas), 'revoked package assignment immediately removes work area access');
reset role;

-- Even a privileged fixture insert cannot create cross-tenant/contract links:
-- these are schema integrity requirements, not merely filtered UI behaviour.
select test.expect_error($q$insert into public.work_areas(organisation_id, contract_id, name, created_by) values ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Cross tenant area', '00000000-0000-0000-0000-000000000012')$q$, array['23503'], 'composite foreign key rejects cross-organisation work area');
select test.expect_error($q$insert into public.work_packages(organisation_id, contract_id, work_area_id, name, quantity, unit) values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Wrong contract area', 10, 'm2')$q$, array['23503'], 'composite foreign key rejects cross-contract package linkage');
select test.expect_error($q$insert into public.package_assignments(organisation_id, contract_id, work_package_id, user_id) values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012')$q$, array['23503', '23514'], 'assignment cannot link a user from a different organisation');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', true);
select public.create_contract('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003',
  '{"reference":"TS-SCHOOL-003","name":"School washroom refurbishment","scope":"Porcelain floor and wall tiling"}') as rpc_contract_id \gset
select test.assert(public.create_contract('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003',
  '{"scope":"Porcelain floor and wall tiling","name":"School washroom refurbishment","reference":"TS-SCHOOL-003"}') = :'rpc_contract_id'::uuid,
  'retry with canonical-equivalent payload returns the original contract');
select test.assert((select count(*) = 1 from public.contracts where reference = 'TS-SCHOOL-003'), 'duplicate submission creates exactly one contract');
select test.assert((select count(*) = 1 from public.audit_events where entity_type = 'contracts' and entity_id = :'rpc_contract_id' and action = 'insert'
  and actor_id = '00000000-0000-0000-0000-000000000001'), 'contract creation has one audit record with genuine authenticated actor');
select test.expect_error($q$select public.create_contract('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', '{"reference":"TS-SCHOOL-003","name":"Changed payload"}')$q$,
  array['22023'], 'reusing request key for a changed payload fails explicitly');
select test.expect_error($q$select public.create_contract('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000004', '{"reference":"FAKE","name":"Fake","created_by":"00000000-0000-0000-0000-000000000004"}')$q$,
  array['22023'], 'RPC refuses a fabricated actor field');
select test.expect_error($q$select public.create_contract('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000004', '{"reference":"FAKE","name":"Fake","state":"approved"}')$q$,
  array['22023'], 'even owner cannot fabricate commercial acceptance through foundation RPC');
select test.expect_error($q$update public.contracts set state = 'draft' where reference = 'TS-SCHOOL-003'$q$, array['42501'], 'direct contract state mutations are revoked for owner too');
select test.assert(public.update_contract(:'rpc_contract_id', 1, '{"scope":"Porcelain floor and wall tiling to revised draft scope"}') = 2,
  'authorised contract edit increments optimistic-lock version');
select test.expect_error(format('select public.update_contract(%L, 1, %L)', :'rpc_contract_id', '{"name":"Stale edit"}'), array['40001'], 'stale contract edit fails instead of overwriting a newer change');
select test.assert((select count(*) = 1 from public.audit_events where entity_type = 'contracts' and entity_id = :'rpc_contract_id' and action = 'update'
  and actor_id = '00000000-0000-0000-0000-000000000001'), 'only successful contract edit creates immutable actor audit');
select test.expect_error('update public.audit_events set actor_id = null', array['42501'], 'audit event actor cannot be rewritten');
select test.expect_error('delete from public.audit_events', array['42501'], 'owner cannot delete audit history');
select test.expect_error($q$insert into public.audit_events(organisation_id, actor_id, action, entity_type, entity_id) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'approve', 'contracts', 'fake')$q$,
  array['42501'], 'owner cannot directly insert fabricated approval/audit events');
select test.expect_error('select * from private.idempotency_keys', array['42501'], 'idempotency store cannot be read directly by application clients');
select test.expect_error($q$select private.record_request('10000000-0000-0000-0000-000000000001', 'fake', '60000000-0000-0000-0000-000000000004', '{}', '20000000-0000-0000-0000-000000000001')$q$,
  array['42501'], 'client cannot invoke internal idempotency mutation helper');
select test.assert(public.save_contract_commercial('20000000-0000-0000-0000-000000000001', 1, '{"preliminaries_budget":6500}') = 2,
  'owner commercial edit increments independent commercial version');
select test.expect_error($q$select public.save_contract_commercial('20000000-0000-0000-0000-000000000001', 1, '{"preliminaries_budget":7000}')$q$,
  array['40001'], 'stale commercial edit fails safely');
select test.expect_error($q$select public.save_contract_commercial('20000000-0000-0000-0000-000000000001', 2, '{"labour_budget":-100}')$q$,
  array['22023'], 'negative commercial amounts are rejected by database validation');
select test.expect_error($q$select public.save_contract_commercial('20000000-0000-0000-0000-000000000001', 2, '{"contract_value":"120000"}')$q$,
  array['22023'], 'raw RPC rejects numeric strings instead of silently coercing them');
select test.expect_error($q$select public.save_contract_commercial('20000000-0000-0000-0000-000000000001', 2, '{"contract_value":120000.005}')$q$,
  array['22023'], 'raw RPC rejects fractions of a penny instead of silently rounding');
select test.expect_error($q$select public.save_contract_commercial('20000000-0000-0000-0000-000000000001', 2, '{"contract_value":1000000001}')$q$,
  array['22023'], 'raw RPC rejects out-of-range commercial amounts');
select test.expect_error(format('select public.update_contract(%L, 2, %L)', :'rpc_contract_id', '{"name":["fake"]}'),
  array['22023'], 'raw RPC rejects non-text contract name');
select test.expect_error(format('select public.update_contract(%L, 2, %L)', :'rpc_contract_id', '{"start_date":"10/10/2026"}'),
  array['22023'], 'raw RPC requires an unambiguous ISO programme date');
select test.assert((select count(*) = 1 from public.audit_events where entity_type = 'contract_commercials' and entity_id = '20000000-0000-0000-0000-000000000001'
  and action = 'update' and commercial and actor_id = '00000000-0000-0000-0000-000000000001'), 'commercial edit is audited and classified as commercial');

select public.create_work_area('20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000005',
  '{"name":"Draft stair landing","location":"Drawing A-102"}') as rpc_area_id \gset
select test.assert(public.create_work_area('20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000005',
  '{"name":"Draft stair landing","location":"Drawing A-102"}') = :'rpc_area_id'::uuid, 'work area submissions are idempotent');
select test.assert((select specification_revision = 'unapproved' from public.work_areas where id = :'rpc_area_id'), 'created work area cannot claim an approved specification');
select public.create_work_package(:'rpc_area_id', '60000000-0000-0000-0000-000000000006',
  '{"name":"Landing porcelain","quantity":25,"unit":"m2"}') as rpc_package_id \gset
select test.assert(public.create_work_package(:'rpc_area_id', '60000000-0000-0000-0000-000000000006',
  '{"name":"Landing porcelain","quantity":25,"unit":"m2"}') = :'rpc_package_id'::uuid, 'work package submissions are idempotent');
select test.expect_error(format('select public.create_work_package(%L, %L, %L)', :'rpc_area_id', '60000000-0000-0000-0000-000000000006', '{"name":"Landing porcelain","quantity":30,"unit":"m2"}'),
  array['22023'], 'changed package quantity cannot reuse an earlier request key');
select test.expect_error($q$select public.save_member('00000000-0000-0000-0000-000000000001', 'Owner', 'contracts_manager', true, true)$q$,
  array['23514'], 'owner cannot remove the final active owner');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000004"}', true);
select test.assert((select count(*) = 0 from public.audit_events where commercial), 'commercial audit entries are hidden from supervisor');
select test.assert((select count(*) = 0 from public.audit_events where organisation_id = '10000000-0000-0000-0000-000000000002'), 'audit history respects organisation isolation');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003"}', true);
select public.create_contract('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000007',
  '{"reference":"TS-CLINIC-004","name":"Clinic wet-room tiling"}') as manager_contract_id \gset
select test.assert((select count(*) = 1 from public.contracts where id = :'manager_contract_id'), 'manager-created contract is explicitly allocated to that manager');
select test.expect_error($q$select public.create_contract('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000008', '{"reference":"DENIED-FINANCE","name":"Denied financial create"}', '{"contract_value":10000}')$q$,
  array['42501'], 'ungranted manager cannot smuggle commercial data through contract creation');
select test.assert((select count(*) = 0 from public.contracts where reference = 'DENIED-FINANCE'), 'failed combined creation rolls back its contract and allocation');

reset role;
-- Restore the north installer allocation for independent private-file tests.
insert into public.package_assignments(organisation_id, contract_id, work_package_id, user_id)
values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006');
select test.assert((select not public and file_size_limit = 4194304 and allowed_mime_types = array['application/pdf','image/jpeg','image/png']
  from storage.buckets where id = 'tilespec-evidence'), 'private evidence bucket restricts size and allowed MIME types');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000006"}', true);
insert into public.document_revisions(id, organisation_id, contract_id, work_area_id, document_reference, revision, title, classification, object_path, sha256, mime_type, bytes)
values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'NORTH-PHOTO', 1, 'North substrate evidence', 'operational',
  '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/operational/30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001.jpg', repeat('a',64), 'image/jpeg', 128);
select test.assert((select count(*) = 1 from public.document_revisions where uploaded_at is null), 'uploader sees explicitly unsynchronised pending metadata');
select test.expect_error($q$select public.complete_document_upload('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006',repeat('a',64))$q$, array['42501'], 'authenticated uploader cannot bypass server file verification by completing metadata');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000006","role":"service_role"}', true);
select test.expect_error($q$select public.complete_document_upload('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006',repeat('a',64))$q$, array['42501'], 'forged service role JWT claim cannot bypass the function execution grant');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select test.expect_error($q$select public.complete_document_upload('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006',repeat('a',64))$q$, array['42501'], 'privileged completion also requires the trusted service JWT context');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select test.expect_error($q$select public.complete_document_upload('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006',repeat('a',64))$q$, array['23514'], 'trusted completion cannot accept metadata before its object exists');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000006"}', true);
select test.expect_error($q$insert into storage.objects(bucket_id,name) values ('tilespec-evidence', '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/operational/30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000099.jpg')$q$,
  array['42501'], 'raw upload without reserved metadata is denied');
select test.expect_error($q$insert into public.document_revisions(id,organisation_id,contract_id,work_area_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes,created_by) values ('50000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','SPOOF',1,'Spoof','operational','10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/operational/30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000009.jpg',repeat('a',64),'image/jpeg',128,'00000000-0000-0000-0000-000000000004')$q$,
  array['42501'], 'document uploader identity cannot be forged');
select test.expect_error($q$insert into public.document_revisions(id,organisation_id,contract_id,work_area_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes,uploaded_at) values ('50000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','PRECOMPLETE',1,'Precomplete','operational','10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/operational/30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000009.jpg',repeat('a',64),'image/jpeg',128,now())$q$,
  array['42501'], 'client cannot assert a file has already been uploaded');
select test.expect_error($q$insert into public.document_revisions(id,organisation_id,contract_id,work_area_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes) values ('50000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','WRONG-AREA',1,'Wrong area','operational','10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/operational/30000000-0000-0000-0000-000000000002/50000000-0000-0000-0000-000000000009.jpg',repeat('a',64),'image/jpeg',128)$q$,
  array['42501'], 'installer cannot reserve another gang work area evidence');
select test.expect_error($q$insert into public.document_revisions(id,organisation_id,contract_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes) values ('50000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','SECRET',1,'Selling prices','commercial','10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/commercial/contract/50000000-0000-0000-0000-000000000009.pdf',repeat('a',64),'application/pdf',128)$q$,
  array['42501'], 'installer cannot reserve a commercial document');
select test.expect_error($q$insert into public.document_revisions(id,organisation_id,contract_id,work_area_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes) values ('50000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','OVERSIZE',1,'Oversize','operational','10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/operational/30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000009.jpg',repeat('a',64),'image/jpeg',4194305)$q$,
  array['23514'], 'database rejects evidence metadata exceeding upload size limit');
select test.expect_error($q$insert into public.document_revisions(id,organisation_id,contract_id,work_area_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes) values ('50000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','BAD-PATH',1,'Bad path','operational','../../secret.jpg',repeat('a',64),'image/jpeg',128)$q$,
  array['23514'], 'database rejects traversal or mismatched evidence paths');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000004"}', true);
select test.assert((select count(*) = 0 from public.document_revisions), 'supervisor sees no incomplete evidence as uploaded');
select test.expect_error($q$select public.complete_document_upload('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004',repeat('a',64))$q$, array['42501'], 'different authenticated actor cannot complete an uploader reservation');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000007"}', true);
select test.assert((select count(*) = 0 from public.document_revisions), 'other gang cannot see pending evidence metadata');
select test.expect_error($q$insert into storage.objects(bucket_id,name) values ('tilespec-evidence', '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/operational/30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001.jpg')$q$,
  array['42501'], 'other gang cannot upload into another actor reservation');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000006"}', true);
insert into storage.objects(bucket_id,name,owner,metadata) values ('tilespec-evidence',
  '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/operational/30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001.jpg', auth.uid(), '{"mimetype":"image/jpeg","size":128}');
select test.assert((select count(*) = 0 from storage.objects), 'reserved object remains unreadable until completion');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select test.expect_error($q$select public.complete_document_upload('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004',repeat('a',64))$q$, array['42501'], 'trusted completion rejects a different original actor');
select test.expect_error($q$select public.complete_document_upload('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006',repeat('b',64))$q$, array['42501'], 'trusted completion rejects a mismatched verified file hash');
select public.complete_document_upload('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006',repeat('a',64));
select public.complete_document_upload('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006',repeat('a',64));
select test.assert(auth.uid() is null and auth.role() = 'service_role', 'verified completion restores privileged session claims after genuine actor audit');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000006"}', true);
select test.assert((select count(*) = 1 from public.document_revisions where uploaded_at is not null), 'upload completion retry does not create another revision');
select test.assert((select count(*) = 1 from storage.objects), 'authorised installer can read completed own-area evidence');
select test.expect_error($q$insert into storage.objects(bucket_id,name) values ('tilespec-evidence', '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/operational/30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000001.jpg')$q$,
  array['42501'], 'completed evidence cannot be uploaded again at the immutable path');
with changed as (update storage.objects set name = 'tampered.jpg' returning id)
select test.assert((select count(*) = 0 from changed), 'storage UPDATE policy prevents evidence overwrite');
with removed as (delete from storage.objects returning id)
select test.assert((select count(*) = 0 from removed), 'storage DELETE policy prevents removal of evidence');
select test.expect_error($q$update public.document_revisions set title = 'Tampered'$q$, array['42501'], 'client cannot edit immutable document revision metadata');
select test.expect_error('delete from public.document_revisions', array['42501'], 'client cannot delete document revision history');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000007"}', true);
select test.assert((select count(*) = 0 from storage.objects), 'south gang cannot download north gang evidence');
select test.assert((select count(*) = 0 from public.document_revisions), 'south gang cannot read north gang completed metadata');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', true);
insert into public.document_revisions(id,organisation_id,contract_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes)
values ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','PRICE',1,'Commercial pricing schedule','commercial',
  '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/commercial/contract/50000000-0000-0000-0000-000000000002.pdf',repeat('b',64),'application/pdf',256);
insert into storage.objects(bucket_id,name,owner,metadata) values ('tilespec-evidence',
  '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/commercial/contract/50000000-0000-0000-0000-000000000002.pdf',auth.uid(),'{"mimetype":"application/pdf","size":256}');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.complete_document_upload('50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',repeat('b',64));
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', true);
select test.assert((select count(*) = 2 from storage.objects), 'owner can access operational and commercial private evidence');
select test.assert((select count(*) = 1 from public.audit_events where entity_type = 'document_revisions' and entity_id = '50000000-0000-0000-0000-000000000001'
  and action = 'update' and actor_id = '00000000-0000-0000-0000-000000000006'), 'upload completion produces exactly one genuine uploader audit record');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', true);
select test.assert((select count(*) = 2 from storage.objects), 'financially authorised allocated manager can read commercial documents');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003"}', true);
select test.assert((select count(*) = 1 from storage.objects), 'operational manager cannot read commercial document objects');
select test.assert((select count(*) = 0 from public.document_revisions where classification = 'commercial'), 'commercial metadata is hidden from manager without grant');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000006"}', true);
select test.assert((select count(*) = 0 from public.document_revisions where classification = 'commercial'), 'subcontractor cannot access pricing document metadata');
select test.assert((select count(*) = 1 from storage.objects), 'subcontractor sees own evidence only, no commercial object');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000012"}', true);
select test.assert((select count(*) = 0 from storage.objects), 'other organisation owner cannot download evidence');
reset role;
set local role anon;
select test.assert((select count(*) = 0 from storage.objects), 'anonymous cannot download private evidence');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000006"}', true);
insert into public.document_revisions(id,organisation_id,contract_id,work_area_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes)
values ('50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','MISMATCH',1,'Incomplete mismatched evidence','operational',
  '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/operational/30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000003.jpg',repeat('c',64),'image/jpeg',128);
insert into storage.objects(bucket_id,name,owner,metadata) values ('tilespec-evidence',
  '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/operational/30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000003.jpg',auth.uid(),'{"mimetype":"image/jpeg","size":127}');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select test.expect_error($q$select public.complete_document_upload('50000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000006',repeat('c',64))$q$, array['23514'], 'storage byte mismatch cannot be marked complete');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000006"}', true);
select test.assert((select uploaded_at is null from public.document_revisions where id = '50000000-0000-0000-0000-000000000003'), 'failed integrity check leaves document explicitly pending');
reset role;
-- Platform metadata fixture correction tests MIME verification independently;
-- application callers have no storage UPDATE policy.
update storage.objects set metadata = '{"mimetype":"image/png","size":128}'
  where name = '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/operational/30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000003.jpg';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000006"}', true);
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select test.expect_error($q$select public.complete_document_upload('50000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000006',repeat('c',64))$q$, array['23514'], 'storage MIME mismatch cannot be marked complete');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000006"}', true);
select test.assert((select count(*) = 0 from storage.objects where name like '%50000000-0000-0000-0000-000000000003.jpg'), 'mismatched pending object remains unavailable for downloads');
select test.expect_error($q$insert into public.document_revisions(id,organisation_id,contract_id,work_area_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes) values ('50000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','INVALID-HASH',1,'Invalid hash','operational','10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/operational/30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000004.jpg','not-a-sha256','image/jpeg',128)$q$,
  array['23514'], 'document metadata rejects malformed SHA256 hashes');
select test.expect_error($q$insert into public.document_revisions(id,organisation_id,contract_id,work_area_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes) values ('50000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','EXECUTABLE',1,'Executable','operational','10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/operational/30000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000004.png',repeat('a',64),'application/x-executable',128)$q$,
  array['23514'], 'document metadata rejects disallowed MIME types');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000004"}', true);
select test.assert((select count(*) = 0 from public.audit_events where entity_type = 'document_revisions' and entity_id = '50000000-0000-0000-0000-000000000002'), 'supervisor cannot read commercial document audit events');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', true);
select public.save_member('00000000-0000-0000-0000-000000000002','Commercial Manager','contracts_manager',false,true);
select test.assert((select count(*) = 1 from public.audit_events where entity_type = 'organisation_members' and entity_id = '00000000-0000-0000-0000-000000000002'
  and action = 'update' and actor_id = '00000000-0000-0000-0000-000000000001'
  and details->'before'->>'financial_access' = 'true' and details->'after'->>'financial_access' = 'false'),
  'owner financial revocation records genuine actor and before/after permissions');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', true);
select test.assert((select count(*) = 1 from public.contracts), 'financial revocation preserves allocated operational contract access');
select test.assert((select count(*) = 0 from public.contract_commercials), 'owner financial revocation immediately removes commercial table access');
select test.assert((select count(*) = 1 from storage.objects), 'owner financial revocation immediately removes commercial file access');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', true);
select public.save_member('00000000-0000-0000-0000-000000000002','Commercial Manager','contracts_manager',true,true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', true);
select test.assert((select count(*) = 1 from public.contract_commercials), 'explicit owner financial grant restores only allocated commercial access');
select test.assert((select count(*) = 2 from storage.objects), 'explicit owner financial grant restores authorised commercial document access');
select test.expect_error($q$select public.save_contract_commercial('20000000-0000-0000-0000-000000000001',2,'{"target_margin":10}')$q$,
  array['42501'], 'financially authorised manager cannot change owner-controlled target margin');
select public.save_contract_commercial('20000000-0000-0000-0000-000000000001',2,'{"materials_budget":29000}') as manager_commercial_version \gset
select test.assert(:'manager_commercial_version'::integer = 3 and (select materials_budget = 29000 and target_margin = 30 from public.contract_commercials
  where contract_id = '20000000-0000-0000-0000-000000000001'), 'financially authorised manager can update ordinary budget while retaining owner target margin');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', true);
select public.save_member('00000000-0000-0000-0000-000000000006','North Installer','subcontract_installer',false,false);
select test.assert((select count(*) = 1 from public.audit_events where entity_type = 'organisation_members' and entity_id = '00000000-0000-0000-0000-000000000006'
  and action = 'update' and actor_id = '00000000-0000-0000-0000-000000000001'
  and details->'before'->>'active' = 'true' and details->'after'->>'active' = 'false'), 'owner member inactivation preserves before/after audit accountability');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000006"}', true);
select test.assert((select count(*) = 0 from public.contracts), 'owner member inactivation immediately removes contract access');
select test.assert((select count(*) = 0 from public.document_revisions), 'owner member inactivation removes completed and pending document access');
select test.assert((select count(*) = 0 from storage.objects), 'owner member inactivation immediately removes private object access');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select test.expect_error($q$select public.complete_document_upload('50000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000006',repeat('c',64))$q$,
  array['42501'], 'trusted completion cannot certify upload after original uploader loses site permission');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', true);
select public.save_member('00000000-0000-0000-0000-000000000013','Invited Supervisor','supervisor',false,true);
select test.assert((select count(*) = 1 from public.audit_events where entity_type = 'organisation_members' and entity_id = '00000000-0000-0000-0000-000000000013'
  and action = 'insert' and actor_id = '00000000-0000-0000-0000-000000000001'), 'new user membership requires explicit audited owner action');
select test.expect_error($q$select public.save_member('00000000-0000-0000-0000-000000000013','Invited Supervisor','supervisor',true,true)$q$,
  array['23514'], 'even owner cannot grant a supervisor direct commercial permissions');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000013"}', true);
select test.assert((select count(*) = 0 from public.contracts), 'newly invited supervisor receives no automatic site allocation');
reset role;
select test.assert(true, 'foundation RLS, audit, idempotency and private storage PASSED');
rollback;
