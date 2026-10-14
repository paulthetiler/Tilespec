-- Test-only accounts and package scopes for Phase 3B's browser journeys.
-- Loaded only into the disposable cluster by test-site-e2e.mjs.
begin;
insert into auth.users(id,email) values
 ('e2e00000-0000-4000-8000-000000000004','sam.installer@e2e.invalid'),
 ('e2e00000-0000-4000-8000-000000000005','jo.installer@e2e.invalid'),
 ('e2e00000-0000-4000-8000-000000000006','fred.unassigned@e2e.invalid');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access) values
 ('e2e00000-0000-4000-8000-0000000000a1','e2e00000-0000-4000-8000-000000000004','Sam Smith','subcontract_installer',false),
 ('e2e00000-0000-4000-8000-0000000000a1','e2e00000-0000-4000-8000-000000000005','Jo Jones','subcontract_installer',false),
 ('e2e00000-0000-4000-8000-0000000000a1','e2e00000-0000-4000-8000-000000000006','Fred Unassigned','subcontract_installer',false);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2e00000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.update_operative(id,version,jsonb_build_object('user_id','e2e00000-0000-4000-8000-000000000004')) from public.operatives where display_name='Sam Smith';
select public.update_operative(id,version,jsonb_build_object('user_id','e2e00000-0000-4000-8000-000000000005')) from public.operatives where display_name='Jo Jones';
select public.create_work_package(id,gen_random_uuid(),'{"name":"Flat 52 tiling","quantity":20,"unit":"m2"}')
 from public.work_areas where name='Flat 52' and contract_id='e2e00000-0000-4000-8000-0000000000c1';
insert into public.package_assignments(organisation_id,contract_id,work_package_id,user_id)
 select organisation_id,contract_id,id,person::uuid from public.work_packages,
 unnest(array['e2e00000-0000-4000-8000-000000000004','e2e00000-0000-4000-8000-000000000005']) person where name='Flat 52 tiling';
commit;
