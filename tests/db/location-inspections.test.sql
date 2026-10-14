-- Phase 2B: the supervisor confirms the office's plan for the day and records
-- what actually happened. Scenario letters follow the Phase 2B brief.
-- Disposable local database only; permission assertions run as non-superusers.
begin;

insert into auth.users(id, email) values
  ('a6100000-0000-4000-8000-000000000001', 'dw-owner@example.invalid'),
  ('a6100000-0000-4000-8000-000000000002', 'dw-manager@example.invalid'),
  ('a6100000-0000-4000-8000-000000000003', 'dw-supervisor@example.invalid'),
  ('a6100000-0000-4000-8000-000000000004', 'dw-unassigned-supervisor@example.invalid'),
  ('a6100000-0000-4000-8000-000000000005', 'dw-installer@example.invalid'),
  ('a6100000-0000-4000-8000-000000000006', 'dw-other-supervisor@example.invalid'),
  ('a6100000-0000-4000-8000-000000000007', 'dw-other-owner@example.invalid');
insert into public.organisations(id, name) values
  ('a6200000-0000-4000-8000-000000000001', 'Daily workforce contractor'), ('a6200000-0000-4000-8000-000000000002', 'Another contractor');
insert into public.organisation_members(organisation_id, user_id, display_name, role, financial_access) values
  ('a6200000-0000-4000-8000-000000000001', 'a6100000-0000-4000-8000-000000000001', 'Olive Owner', 'owner', true),
  ('a6200000-0000-4000-8000-000000000001', 'a6100000-0000-4000-8000-000000000002', 'Mia Manager', 'contracts_manager', false),
  ('a6200000-0000-4000-8000-000000000001', 'a6100000-0000-4000-8000-000000000003', 'Sid Supervisor', 'supervisor', false),
  ('a6200000-0000-4000-8000-000000000001', 'a6100000-0000-4000-8000-000000000004', 'Una Unassigned', 'supervisor', false),
  ('a6200000-0000-4000-8000-000000000001', 'a6100000-0000-4000-8000-000000000005', 'Ian Installer', 'subcontract_installer', false),
  ('a6200000-0000-4000-8000-000000000002', 'a6100000-0000-4000-8000-000000000006', 'Oscar Other', 'supervisor', false),
  ('a6200000-0000-4000-8000-000000000002', 'a6100000-0000-4000-8000-000000000007', 'Ola Other', 'owner', true);
insert into public.contracts(id, organisation_id, reference, name, created_by) values
  ('a6300000-0000-4000-8000-000000000001', 'a6200000-0000-4000-8000-000000000001', 'APT-B', 'Riverside apartments Block B', 'a6100000-0000-4000-8000-000000000001'),
  ('a6300000-0000-4000-8000-000000000002', 'a6200000-0000-4000-8000-000000000002', 'OTHER-1', 'Another contractor site', 'a6100000-0000-4000-8000-000000000007');
insert into public.contract_assignments(contract_id, organisation_id, user_id) values
  ('a6300000-0000-4000-8000-000000000001', 'a6200000-0000-4000-8000-000000000001', 'a6100000-0000-4000-8000-000000000002'),
  ('a6300000-0000-4000-8000-000000000001', 'a6200000-0000-4000-8000-000000000001', 'a6100000-0000-4000-8000-000000000003'),
  ('a6300000-0000-4000-8000-000000000002', 'a6200000-0000-4000-8000-000000000002', 'a6100000-0000-4000-8000-000000000006');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a6100000-0000-4000-8000-000000000002"}', true);
select public.create_locations('a6300000-0000-4000-8000-000000000001',gen_random_uuid(),null,
  '[{"name":"Flat 52","children":[{"name":"Bathroom"}]},{"name":"Flat 53"}]');
select id as flat from public.work_areas where name='Flat 52' \gset
select id as bath from public.work_areas where name='Bathroom' \gset
select id as sibling from public.work_areas where name='Flat 53' \gset
select gen_random_uuid() as template_key, gen_random_uuid() as record_key \gset
select jsonb_build_object('contract_id','a6300000-0000-4000-8000-000000000001','work_area_id',:'flat',
 'title','Substrate preparation','stage','preparation','specification_reference','SPEC-52','specification_revision','A','wet_area',false,
 'checklist','[{"label":"Substrate sound","wet_only":false},{"label":"Tanking specified","wet_only":true}]'::jsonb) as template_data \gset
select public.create_location_inspection_template(:'template_key',:'template_data') as template \gset
select test.assert(public.create_location_inspection_template(:'template_key',:'template_data')=:'template', 'template retry returns the same immutable revision');
select test.expect_error(format('select public.create_location_inspection_template(%L,%L::jsonb || ''{"title":"Changed"}'')',:'template_key',:'template_data'),array['22023'],'request key cannot silently change a template');
select test.expect_error(format('select public.create_location_inspection_template(gen_random_uuid(),%L::jsonb || ''{"checklist":[{"label":"Wet only","wet_only":true}]}'')',:'template_data'),array['22023'],'dry template requires an applicable check');
select public.create_operative(gen_random_uuid(),'{"display_name":"Real Person","engagement":"direct_employee"}') as person \gset
select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id','a6300000-0000-4000-8000-000000000001',
 'work_area_id',:'flat','stage','preparation','started_at',now()-interval '2 hours','operative_ids',jsonb_build_array(:'person'),
 'reason','Unplanned preparation')) as actual \gset
select public.record_actual_allocation(gen_random_uuid(), jsonb_build_object('contract_id','a6300000-0000-4000-8000-000000000001',
 'work_area_id',:'sibling','stage','preparation','started_at',now()-interval '4 hours','ended_at',now()-interval '3 hours','operative_ids',jsonb_build_array(:'person'),
 'reason','Unplanned preparation')) as other_actual \gset
select set_config('request.jwt.claims', '{"sub":"a6100000-0000-4000-8000-000000000003"}', true);
select jsonb_build_object('contract_id','a6300000-0000-4000-8000-000000000001','work_area_id',:'bath','template_id',:'template',
 'answers','[{"status":"issue","note":"Substrate needs repair"}]'::jsonb,'allocation_ids',jsonb_build_array(:'actual')) as record_data \gset
select public.record_location_inspection(:'record_key',:'record_data') as inspection \gset
select test.assert(public.record_location_inspection(:'record_key',:'record_data')=:'inspection', 'record retry creates one inspection and one link');
select test.assert((select count(*)=1 from public.location_inspections) and (select count(*)=1 from public.location_inspection_allocations),'safe retry does not duplicate history');
select test.assert((select issues_count=1 and actor_id=auth.uid() and location_path=array['Flat 52','Bathroom'] and created_at=now()
 and answers='[{"item":"Substrate sound","status":"issue","note":"Substrate needs repair"}]'::jsonb from public.location_inspections),'database derives labels, issue count, actor, time and saved path; dry checklist excludes wet checks');
select test.assert((select workforce_snapshot->'attendance'->0->>'display_name'='Real Person' and actual_allocation_id=:'actual' from public.location_inspection_allocations),'inspection links actual attendance at a containing location with a stable snapshot');
select test.expect_error(format('select public.record_location_inspection(%L,%L::jsonb || ''{"answers":[{"status":"pass","note":""}]}'' )',:'record_key',:'record_data'),array['22023'],'changed retry payload is refused');
select test.expect_error(format('select public.record_location_inspection(gen_random_uuid(),%L::jsonb || ''{"answers":[{"status":"na","note":""}]}'' )',:'record_data'),array['22023'],'N/A requires a reason');
select test.expect_error(format('select public.record_location_inspection(gen_random_uuid(),%L::jsonb || ''{"answers":[]}'' )',:'record_data'),array['22023'],'missing answers are refused');
select test.expect_error(format('select public.record_location_inspection(gen_random_uuid(),%L::jsonb || jsonb_build_object(''allocation_ids'',jsonb_build_array(%L)))',:'record_data',:'other_actual'),array['22023'],'unrelated sibling work cannot be linked');
select test.assert((select count(*)=1 from public.location_inspections),'invalid link rolls back the entire inspection');
select test.expect_error(format('select public.create_location_inspection_template(gen_random_uuid(),%L)',:'template_data'),array['42501'],'supervisor cannot define or approve templates');
select test.expect_error('insert into public.location_inspections(organisation_id) values (gen_random_uuid())',array['42501'],'direct writes denied');
select test.expect_error(format('update public.location_inspections set issues_count=0 where id=%L',:'inspection'),array['42501'],'direct rewrites denied');
select test.expect_error(format('delete from public.location_inspection_allocations where inspection_id=%L',:'inspection'),array['42501'],'direct history deletion denied');

-- Revisions affect new inspections only. A stale screen cannot submit against
-- superseded requirements, and the old inspection stays readable.
select set_config('request.jwt.claims', '{"sub":"a6100000-0000-4000-8000-000000000002"}', true);
select public.create_location_inspection_template(gen_random_uuid(),:'template_data'::jsonb || jsonb_build_object('supersedes_id',:'template','specification_revision','B','wet_area',true)) as revision \gset
select test.expect_error(format('select public.create_location_inspection_template(gen_random_uuid(),%L::jsonb || jsonb_build_object(''supersedes_id'',%L))',:'template_data',:'template'),array['40001'],'parallel revision from stale template is refused');
select test.expect_error(format('select public.record_location_inspection(gen_random_uuid(),%L)',:'record_data'),array['40001'],'new records against superseded templates are refused');
select public.record_location_inspection(gen_random_uuid(),:'record_data'::jsonb || jsonb_build_object('template_id',:'revision',
 'answers','[{"status":"pass","note":""},{"status":"na","note":"Reviewed specification exception"}]'::jsonb)) as wet_inspection \gset
select test.assert((select jsonb_array_length(answers)=2 from public.location_inspections where id=:'wet_inspection'),'wet requirements included only by explicit template');
select test.assert((select answers->0->>'status'='issue' from public.location_inspections where id=:'inspection')
 and (select specification_revision='A' from public.location_inspection_templates where id=:'template'),'template revision preserves previous observations and specification reference');
select public.void_actual_allocation(:'actual','Recorded in error');
select test.assert((select count(*)=2 from public.location_inspection_allocations where actual_allocation_id=:'actual'),'voiding work later never deletes inspection links');
select test.assert((select workforce_snapshot->'allocation'->>'voided_at' is null from public.location_inspection_allocations where inspection_id=:'inspection'),'later workforce correction cannot rewrite the inspection snapshot');
select test.expect_error(format('select public.record_location_inspection(gen_random_uuid(),%L::jsonb || jsonb_build_object(''template_id'',%L,''answers'',''[{"status":"pass","note":""},{"status":"pass","note":""}]''::jsonb))',:'record_data',:'revision'),array['22023'],'new inspection cannot link voided work');
select test.assert((select count(*)=6 from public.audit_events where entity_type in ('location_inspection_templates','location_inspections','location_inspection_allocations') and actor_id is not null),'every create is audited with authenticated actor');

-- Exact existing permission boundary: installers, unassigned supervisors and
-- other organisations cannot read or write any Phase 3A record.
select set_config('request.jwt.claims', '{"sub":"a6100000-0000-4000-8000-000000000004"}', true);
select test.assert((select count(*)=0 from public.location_inspections) and (select count(*)=0 from public.location_inspection_templates),'unassigned supervisor reads no inspections or templates');
select test.expect_error(format('select public.record_location_inspection(gen_random_uuid(),%L)',:'record_data'),array['42501'],'unassigned supervisor cannot record');
select set_config('request.jwt.claims', '{"sub":"a6100000-0000-4000-8000-000000000005"}', true);
select test.assert((select count(*)=0 from public.location_inspection_allocations),'installer reads no workforce snapshots');
select test.expect_error(format('select public.record_location_inspection(gen_random_uuid(),%L)',:'record_data'),array['42501'],'installer cannot inspect');
select set_config('request.jwt.claims', '{"sub":"a6100000-0000-4000-8000-000000000007"}', true);
select test.assert((select count(*)=0 from public.location_inspections),'other tenant owner reads no inspections');
select test.expect_error(format('select public.create_location_inspection_template(gen_random_uuid(),%L)',:'template_data'),array['42501'],'other tenant cannot create template');
reset role;
select test.expect_error(format('update public.location_inspections set issues_count=0 where id=%L',:'inspection'),array['42501'],'append-only trigger also protects history from privileged rewrites');
select test.expect_error(format('delete from public.location_inspection_templates where id=%L',:'revision'),array['42501'],'privileged deletion of a template is refused');
rollback;
