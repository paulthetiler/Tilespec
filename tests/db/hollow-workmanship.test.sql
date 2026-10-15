-- Disposable fixtures only: reported hollow sounds cannot become a Pass,
-- including direct RPC calls, safe retries and mandatory hold checks.
begin;
insert into auth.users(id,email) values
 ('ab100000-0000-4000-8000-000000000001','hollow-owner@example.invalid'),
 ('ab100000-0000-4000-8000-000000000002','hollow-supervisor@example.invalid'),
 ('ab100000-0000-4000-8000-000000000003','hollow-unassigned@example.invalid');
insert into public.organisations(id,name) values ('ab200000-0000-4000-8000-000000000001','Hollow finding fixture');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access) values
 ('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001','Office','owner',true),
 ('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','Dave','supervisor',false),
 ('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003','Unassigned','supervisor',false);
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 ('ab300000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001','HOLLOW-TEST','Fictional commercial floor','ab100000-0000-4000-8000-000000000001');
insert into public.contract_assignments(contract_id,organisation_id,user_id) values
 ('ab300000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000001"}',true);
select public.create_locations('ab300000-0000-4000-8000-000000000001',gen_random_uuid(),null,'[{"name":"Commercial tiled floor"}]');
select id as area from public.work_areas where contract_id='ab300000-0000-4000-8000-000000000001' \gset
select public.create_location_inspection_template(gen_random_uuid(),jsonb_build_object('contract_id','ab300000-0000-4000-8000-000000000001','work_area_id',:'area',
 'stage','installation','title','Floor workmanship','specification_reference','APPROVED-SYSTEM','specification_revision','A','wet_area',false,
 'checklist','[{"label":"Hollow-sounding floor tiles","wet_only":false},{"label":"Movement joints","wet_only":false,"hold_point":true}]'::jsonb)) as template \gset
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000002"}',true);
select jsonb_build_object('contract_id','ab300000-0000-4000-8000-000000000001','work_area_id',:'area','template_id',:'template',
 'answers','[{"status":"pass","note":"Tile by doorway","hollow_found":true},{"status":"pass","note":""}]'::jsonb,'allocation_ids','[]'::jsonb) as payload,gen_random_uuid() as request \gset
select public.record_location_inspection(:'request',:'payload') as observation \gset
select test.assert((select issues_count=1 and answers->0->>'status'='issue'
 and answers->0->>'note' like 'Hollow-sounding tile found. Investigate against the installation system and project requirements.%'
 and answers->1->>'hold_point'='true' from public.location_inspections where id=:'observation'),
 'a direct API reported hollow sound cannot be passed; project investigation and mandatory flags are saved');
select test.assert(public.record_location_inspection(:'request',:'payload')=:'observation'
 and (select count(*)=1 from public.location_inspections where contract_id='ab300000-0000-4000-8000-000000000001'),
 'retrying the same structured finding keeps one permanent observation');
select test.expect_error(format('select public.record_location_inspection(%L,%L::jsonb || ''{"answers":[{"status":"pass","note":"Tile by doorway","hollow_found":false},{"status":"pass","note":""}]}'' )',:'request',:'payload'),array['22023'],
 'the saved investigation finding cannot silently become a pass under the same key');
select test.expect_error(format('select public.record_location_inspection(gen_random_uuid(),%L::jsonb || ''{"answers":[{"status":"pass","note":"","hollow_found":"true"},{"status":"pass","note":""}]}'' )',:'payload'),array['22023'],
 'hollow finding requires an actual boolean');
select test.expect_error(format('select public.record_location_inspection(gen_random_uuid(),%L::jsonb || ''{"answers":[{"status":"pass","note":""},{"status":"pass","note":"","hollow_found":true}]}'' )',:'payload'),array['22023'],
 'a hollow finding must match the approved hollow tile checklist item');
select public.record_location_inspection(gen_random_uuid(),:'payload'::jsonb || '{"answers":[{"status":"pass","note":"","hollow_found":false},{"status":"na","note":"Cannot inspect joint yet"}]}'::jsonb) as not_ready \gset
select test.assert((select issues_count=0 and answers->1->>'status'='na' and answers->1->>'hold_point'='true' from public.location_inspections where id=:'not_ready'),
 'new workflow preserves mandatory N/A blocking semantics and legacy issue counts');
select md5(to_jsonb(i)::text) as original_hash from public.location_inspections i where id=:'observation' \gset
select public.record_location_inspection(gen_random_uuid(),:'payload'::jsonb || '{"answers":[{"status":"pass","note":"","hollow_found":false},{"status":"pass","note":""}]}'::jsonb);
select test.assert((select md5(to_jsonb(i)::text)=:'original_hash' from public.location_inspections i where id=:'observation'),
 'later acceptable work never rewrites the original investigation finding');
select test.expect_error(format('select private.phase3c_record_location_inspection(gen_random_uuid(),%L::jsonb)',:'payload'),array['42501'],
 'authenticated callers cannot bypass the new finding checks through the old implementation');
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000003"}',true);
select test.expect_error(format('select public.record_location_inspection(gen_random_uuid(),%L::jsonb)',:'payload'),array['42501'],
 'unassigned supervisors still cannot record or retry findings on this site');
select test.assert((select count(*)=0 from public.location_inspections where contract_id='ab300000-0000-4000-8000-000000000001'),
 'existing RLS still hides inspection history from unassigned supervisors');
rollback;
