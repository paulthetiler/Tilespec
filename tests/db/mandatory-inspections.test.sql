-- Real RPCs, RLS and private verified document completion in a disposable DB.
begin;
insert into auth.users(id,email) values
 ('a7100000-0000-4000-8000-000000000001','mandatory-owner@example.invalid'),
 ('a7100000-0000-4000-8000-000000000002','mandatory-supervisor@example.invalid'),
 ('a7100000-0000-4000-8000-000000000003','mandatory-installer@example.invalid'),
 ('a7100000-0000-4000-8000-000000000004','mandatory-other-owner@example.invalid');
insert into public.organisations(id,name) values ('a7200000-0000-4000-8000-000000000001','Mandatory inspections'),('a7200000-0000-4000-8000-000000000002','Other organisation');
insert into public.organisation_members(organisation_id,user_id,display_name,role) values
 ('a7200000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000001','Office Owner','owner'),
 ('a7200000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000002','Site Supervisor','supervisor'),
 ('a7200000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000003','Installer','subcontract_installer'),
 ('a7200000-0000-4000-8000-000000000002','a7100000-0000-4000-8000-000000000004','Other Owner','owner');
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 ('a7300000-0000-4000-8000-000000000001','a7200000-0000-4000-8000-000000000001','MAND-1','Required inspections site','a7100000-0000-4000-8000-000000000001'),
 ('a7300000-0000-4000-8000-000000000002','a7200000-0000-4000-8000-000000000002','MAND-2','Other site','a7100000-0000-4000-8000-000000000004');
insert into public.contract_assignments(organisation_id,contract_id,user_id) values
 ('a7200000-0000-4000-8000-000000000001','a7300000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000001"}',true);
select public.create_locations('a7300000-0000-4000-8000-000000000001',gen_random_uuid(),null,'[{"name":"Floor","children":[{"name":"Bathroom"},{"name":"Unrelated room"}]}]');
select id as floor from public.work_areas where name='Floor' \gset
select id as room from public.work_areas where name='Bathroom' \gset
select id as sibling from public.work_areas where name='Unrelated room' \gset
select public.create_work_package(:'floor',gen_random_uuid(),'{"name":"Package A","quantity":1,"unit":"m2"}') as package_a \gset
select public.create_work_package(:'floor',gen_random_uuid(),'{"name":"Package B","quantity":1,"unit":"m2"}') as package_b \gset
select gen_random_uuid() as doc \gset
insert into public.document_revisions(id,organisation_id,contract_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes)
values(:'doc','a7200000-0000-4000-8000-000000000001','a7300000-0000-4000-8000-000000000001','SPEC-1',1,'Approved waterproofing system','operational',
 'a7200000-0000-4000-8000-000000000001/a7300000-0000-4000-8000-000000000001/operational/contract/'||:'doc'||'.pdf',repeat('a',64),'application/pdf',9);
insert into storage.objects(bucket_id,name,owner,metadata) values('tilespec-evidence',
 'a7200000-0000-4000-8000-000000000001/a7300000-0000-4000-8000-000000000001/operational/contract/'||:'doc'||'.pdf',auth.uid(),'{"size":9,"mimetype":"application/pdf"}');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role","sub":"a7100000-0000-4000-8000-000000000001"}',true);
select public.complete_document_upload(:'doc','a7100000-0000-4000-8000-000000000001',repeat('a',64));
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000001"}',true);
select jsonb_build_object('contract_id','a7300000-0000-4000-8000-000000000001','work_area_id',:'floor','stage','installation',
 'title','Waterproofing hold point','specification_reference','SPEC-1','specification_revision','1','wet_area',true,
 'checklist','[{"label":"Waterproofing test meets approved system","wet_only":false,"hold_point":true,"evidence_required":true},{"label":"Inspection note","wet_only":false}]'::jsonb) as template_data \gset
select public.create_location_inspection_template(gen_random_uuid(),:'template_data') as template \gset
select test.assert((public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',null,'installation')->>'unknown')::boolean,
 'a checklist alone does not invent inspection applicability or work release');
select jsonb_build_object('contract_id','a7300000-0000-4000-8000-000000000001','work_area_id',:'floor','stage','installation','applicability','required',
 'template_id',:'template','approved_document_ids',jsonb_build_array(:'doc'),'basis','Office approval of manufacturer system and specification revision') as requirement_data \gset
select gen_random_uuid() as requirement_key \gset
select public.configure_inspection_requirement(:'requirement_key',:'requirement_data') as requirement \gset
select test.assert(public.configure_inspection_requirement(:'requirement_key',:'requirement_data')=:'requirement','applicability retry returns the same immutable decision');
select test.expect_error(format('select public.configure_inspection_requirement(%L,%L::jsonb||''{"basis":"Different basis"}'')',:'requirement_key',:'requirement_data'),array['22023'],'changed applicability retry payload rejected');
select test.assert(not(public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',null,'installation')->>'passed')::boolean,
 'an applicable mandatory inspection remains outstanding before a saved result');
select test.expect_error(format('select public.inspection_requirements(''a7300000-0000-4000-8000-000000000001'',%L,gen_random_uuid(),''installation'')',:'room'),array['22023'],'an omitted or foreign package cannot masquerade as configured scope');
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000002"}',true);
select test.expect_error(format('select public.configure_inspection_requirement(gen_random_uuid(),%L)',:'requirement_data'),array['42501'],'supervisor cannot approve specification applicability');
select jsonb_build_object('contract_id','a7300000-0000-4000-8000-000000000001','work_area_id',:'room','template_id',:'template','allocation_ids','[]'::jsonb,
 'answers','[{"status":"pass","note":""},{"status":"pass","note":""}]'::jsonb) as inspection_data \gset
select test.expect_error(format('select public.record_location_inspection(gen_random_uuid(),%L)',:'inspection_data'),array['22023'],'evidence-required Pass cannot be saved without verified evidence');
select public.record_location_inspection(gen_random_uuid(),:'inspection_data'::jsonb||'{"answers":[{"status":"na","note":"Cannot complete test"},{"status":"pass","note":""}]}') as na_inspection \gset
select test.assert((public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',null,'installation')->>'failed')::boolean,
 'N/A cannot satisfy a mandatory hold point even with an explanatory note');
select test.assert((select answers->0->>'hold_point'='true' and answers->0->>'evidence_required'='true' from public.location_inspections where id=:'na_inspection'),
 'the saved answer snapshots the mandatory hold-point and evidence requirement');
select public.create_work_hold(gen_random_uuid(),jsonb_build_object('contract_id','a7300000-0000-4000-8000-000000000001','work_area_id',:'room',
 'stage','installation','hold_type','quality','category','Mandatory hold point not passed','severity','major','reason','The mandatory waterproofing inspection could not be completed',
 'required_action','Complete and pass the approved waterproofing inspection before release','source_inspection_id',:'na_inspection',
 'document_ids','[]'::jsonb,'evidence_explanation','The recorded N/A inspection explains the immediate quality restriction')) as na_hold \gset
select test.assert((select source_inspection_id=:'na_inspection' and status='active' from public.work_holds where id=:'na_hold'),
 'an unsatisfied mandatory N/A answer can explicitly originate a linked hold even without an ordinary issue answer');
select test.assert((public.hold_register('{"contract_id":"a7300000-0000-4000-8000-000000000001","stage":"installation"}',0)->'quality_counts'->>'failed_inspections')::integer=1,
 'the office failure count includes an unsatisfied mandatory N/A answer');
select test.expect_error(format('select public.record_location_inspection(gen_random_uuid(),%L::jsonb||jsonb_build_object(''answers'',jsonb_build_array(jsonb_build_object(''status'',''pass'',''note'','''',''document_ids'',jsonb_build_array(gen_random_uuid())),jsonb_build_object(''status'',''pass'',''note'',''''))))',:'inspection_data'),array['22023'],'unknown or unverified document IDs do not satisfy evidence');
select public.record_location_inspection(gen_random_uuid(),:'inspection_data'::jsonb||jsonb_build_object('answers',jsonb_build_array(jsonb_build_object('status','pass','note','Recorded test meets system requirements','document_ids',jsonb_build_array(:'doc')),jsonb_build_object('status','pass','note','')))) as passed_inspection \gset
select test.assert((public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',null,'installation')->>'passed')::boolean,
 'the latest passing mandatory inspection with verified evidence satisfies this activity');
select test.assert((select answers->0->'document_ids'=jsonb_build_array(:'doc') from public.location_inspections where id=:'passed_inspection'),
 'the result permanently links the exact verified supporting document');
select public.record_location_inspection(gen_random_uuid(),:'inspection_data'::jsonb||'{"answers":[{"status":"issue","note":"Retest failed"},{"status":"pass","note":""}]}') as failed_inspection \gset
select test.assert((public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',null,'installation')->>'failed')::boolean,
 'a later failed inspection blocks the activity even when an earlier result passed in the same transaction');
select public.record_location_inspection(gen_random_uuid(),:'inspection_data'::jsonb||jsonb_build_object('work_package_id',:'package_a',
 'answers',jsonb_build_array(jsonb_build_object('status','pass','note','Package A was independently reinspected','document_ids',jsonb_build_array(:'doc')),jsonb_build_object('status','pass','note','')))) as package_pass \gset
select test.assert((public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',:'package_a','installation')->>'passed')::boolean,
 'an exact package inspection can satisfy a location-wide requirement for that package');
select test.assert((public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',:'package_b','installation')->>'failed')::boolean
 and (public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',null,'installation')->>'failed')::boolean,
 'a passing package observation does not clear another package or the whole location after a global failure');
select test.assert((public.hold_register('{"contract_id":"a7300000-0000-4000-8000-000000000001","stage":"installation"}',0)->'quality_counts'->>'failed_inspections')::integer=1,
 'the office failure count does not let a package-only pass hide the latest whole-location failure');
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000001"}',true);
select public.configure_inspection_requirement(gen_random_uuid(),:'requirement_data'::jsonb||jsonb_build_object('work_area_id',:'room','applicability','not_required','template_id',null)) as narrower \gset
select test.assert((public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',null,'installation')->>'failed')::boolean,
 'a narrower not-required decision never clears an ancestor mandatory failure');
select test.assert(not(public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'sibling',null,'installation')->>'passed')::boolean,
 'a passing result in another room does not fulfil this room requirement');
select test.assert((public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',null,'grouting')->>'unknown')::boolean,
 'applicability for a different activity remains unknown');
select public.configure_inspection_requirement(gen_random_uuid(),:'requirement_data'::jsonb||jsonb_build_object('stage','protection','applicability','not_required','template_id',null,'work_package_id',:'package_a')) as package_a_approval \gset
select test.assert((public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',:'package_a','protection')->>'passed')::boolean,
 'an explicit package applicability decision assesses that package only');
select test.assert((public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',:'package_b','protection')->>'unknown')::boolean and
 (public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',null,'protection')->>'unknown')::boolean,
 'one assessed package never clears unknown applicability for another package or the whole location');
reset role;
select test.expect_error(format('select private.assert_hold_requirements(''a7300000-0000-4000-8000-000000000001'',%L,''protection'',null,now())',:'room'),array['22023'],
 'a broader release cannot inherit the approval of one specific package');
set local role authenticated;
-- A newer office approval cannot inherit observations made before that revision.
select public.record_location_inspection(gen_random_uuid(),:'inspection_data'::jsonb||jsonb_build_object('answers',jsonb_build_array(jsonb_build_object('status','pass','note','New test meets approved requirements','document_ids',jsonb_build_array(:'doc')),jsonb_build_object('status','pass','note','')))) as fresh_pass \gset
select test.assert((public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',null,'installation')->>'passed')::boolean,
 'a fresh passing inspection resolves the latest mandatory failure');
reset role;
select test.assert((private.assert_hold_requirements('a7300000-0000-4000-8000-000000000001',:'room','installation',null,now())->>'passed')::boolean,
 'the release gate accepts a configured exact location with a passing inspection after correction');
select test.expect_error(format('select private.assert_hold_requirements(''a7300000-0000-4000-8000-000000000001'',%L,''installation'',null,now())',:'floor'),array['22023'],
 'a broader release reviews every active leaf room rather than accepting one passing room');
select test.expect_error(format('select private.assert_hold_requirements(''a7300000-0000-4000-8000-000000000001'',%L,''installation'',null,clock_timestamp())',:'room'),array['22023'],
 'a saved inspection before the corrective action cannot authorise release');
set local role authenticated;
select public.configure_inspection_requirement(gen_random_uuid(),:'requirement_data'::jsonb||jsonb_build_object('supersedes_id',:'requirement','basis','Reapproved specification and updated inspection applicability')) as revised_requirement \gset
select test.assert(not(public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',null,'installation')->>'passed')::boolean and
 exists(select 1 from jsonb_array_elements(public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',null,'installation')->'requirements') req where req->>'status'='awaiting_inspection'),
 'a newer applicability revision requires an inspection after its approval even in the same transaction');
select public.configure_inspection_requirement(gen_random_uuid(),:'requirement_data'::jsonb||jsonb_build_object('stage','grouting','applicability','not_required','template_id',null)) as not_required_grouting \gset
select public.create_location_inspection_template(gen_random_uuid(),:'template_data'::jsonb||'{"stage":"grouting","title":"Mandatory grouting hold point"}') as grouting_template \gset
select test.assert((public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',null,'grouting')->>'unknown')::boolean and
 not(public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',null,'grouting')->>'passed')::boolean,
 'a not-required decision cannot bypass a current unconfigured mandatory hold-point template');
-- A reserved or merely uploaded draft photo is not yet original finding
-- evidence. Only a verified, event-bound photograph is eligible.
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000002"}',true);
select public.create_snag(gen_random_uuid(),jsonb_build_object('contract_id','a7300000-0000-4000-8000-000000000001','work_area_id',:'room',
 'stage','installation','category','Evidence inspection','severity','major','description','Waterproofing evidence record','required_rectification','Inspect against approved system')) as evidence_snag \gset
select public.reserve_snag_photo(:'evidence_snag',gen_random_uuid(),'original','{"mime_type":"image/png","sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","bytes":8}') as evidence_photo \gset
select jsonb_build_object('answers',jsonb_build_array(jsonb_build_object('status','pass','note','Documented observation','photo_ids',jsonb_build_array(:'evidence_photo')),jsonb_build_object('status','pass','note',''))) as photo_answers \gset
select test.expect_error(format('select public.record_location_inspection(gen_random_uuid(),%L::jsonb||%L::jsonb)',:'inspection_data',:'photo_answers'),array['22023'],
 'a reserved unverified photograph cannot satisfy inspection evidence');
insert into storage.objects(bucket_id,name,owner,metadata) select 'supervisor-evidence',object_path,auth.uid(),'{"size":8,"mimetype":"image/png"}'
 from public.supervisor_issue_photos where id=:'evidence_photo';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role","sub":"a7100000-0000-4000-8000-000000000002"}',true);
select public.complete_snag_photo(:'evidence_photo','a7100000-0000-4000-8000-000000000002',repeat('b',64));
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000002"}',true);
select test.expect_error(format('select public.record_location_inspection(gen_random_uuid(),%L::jsonb||%L::jsonb)',:'inspection_data',:'photo_answers'),array['22023'],
 'a verified but unsubmitted draft photograph cannot satisfy inspection evidence');
select public.transition_snag(:'evidence_snag',gen_random_uuid(),1,'submit',jsonb_build_object('note','Verified original finding submitted','photo_ids',jsonb_build_array(:'evidence_photo')));
select public.record_location_inspection(gen_random_uuid(),:'inspection_data'::jsonb||:'photo_answers'::jsonb) as photo_inspection \gset
select test.assert((select answers->0->'photo_ids'=jsonb_build_array(:'evidence_photo') from public.location_inspections where id=:'photo_inspection'),
 'a genuinely verified event-bound photograph remains permanently linked to the inspection');
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000001"}',true);
select public.create_location_inspection_template(gen_random_uuid(),:'template_data'::jsonb||jsonb_build_object('supersedes_id',:'template','specification_revision','2')) as revised_template \gset
select test.assert(exists(select 1 from jsonb_array_elements(public.inspection_requirements('a7300000-0000-4000-8000-000000000001',:'room',null,'installation')->'requirements') req where req->>'status'='configuration_outdated'),
 'a revised template requires a fresh office applicability decision and never inherits old approval');
select test.assert((select answers->0->>'status'='pass' from public.location_inspections where id=:'passed_inspection') and
 (select specification_revision='1' from public.location_inspection_templates where id=:'template'),'new template versions preserve original inspection and specification records');
select test.expect_error(format('update public.location_inspection_requirements set basis=''Changed'' where id=%L',:'requirement'),array['42501'],'direct applicability mutation denied');
select test.expect_error(format('delete from public.location_inspection_requirements where id=%L',:'requirement'),array['42501'],'applicability history deletion denied');
select test.expect_error(format('select private.mandatory_work_requirements(''a7300000-0000-4000-8000-000000000001'',%L,null,''installation'')',:'room'),array['42501'],'private requirement helper is not an unauthorised RPC');
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000003"}',true);
select test.assert((select count(*)=0 from public.location_inspection_requirements),'installer receives no raw requirement approval or inspection snapshots');
select test.expect_error(format('select public.inspection_requirements(''a7300000-0000-4000-8000-000000000001'',%L,null,''installation'')',:'room'),array['42501'],'installer cannot use staff inspection requirement RPC');
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000004"}',true);
select test.assert((select count(*)=0 from public.location_inspection_requirements),'another organisation sees no approval decisions');
select test.expect_error(format('select public.configure_inspection_requirement(gen_random_uuid(),%L)',:'requirement_data'),array['42501'],'another organisation cannot configure requirements');
reset role;
select test.expect_error(format('update public.location_inspection_requirements set basis=''Privileged change'' where id=%L',:'requirement'),array['42501'],'append-only guard also protects applicability from privileged rewrites');
rollback;
