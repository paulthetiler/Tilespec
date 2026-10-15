-- Real role/RLS checks for formal restrictions and private, immutable evidence.
-- The runner creates a disposable local PostgreSQL cluster; no hosted DB exists.
begin;
insert into auth.users(id,email) values
 ('cf100000-0000-4000-8000-000000000001','hold-workflow-owner@example.invalid'),
 ('cf100000-0000-4000-8000-000000000002','hold-workflow-supervisor@example.invalid'),
 ('cf100000-0000-4000-8000-000000000003','hold-workflow-manager@example.invalid'),
 ('cf100000-0000-4000-8000-000000000004','hold-workflow-installer@example.invalid'),
 ('cf100000-0000-4000-8000-000000000005','hold-workflow-unassigned@example.invalid'),
 ('cf100000-0000-4000-8000-000000000006','hold-workflow-outsider@example.invalid');
insert into public.organisations(id,name) values
 ('cf200000-0000-4000-8000-000000000001','Hold workflow contractor'),
 ('cf200000-0000-4000-8000-000000000002','Other hold workflow contractor');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access) values
 ('cf200000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000001','Workflow office','owner',true),
 ('cf200000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000002','Workflow supervisor','supervisor',false),
 ('cf200000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000003','Workflow independent manager','contracts_manager',false),
 ('cf200000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000004','Workflow repair installer','subcontract_installer',false),
 ('cf200000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000005','Unassigned site supervisor','supervisor',false),
 ('cf200000-0000-4000-8000-000000000002','cf100000-0000-4000-8000-000000000006','Other organisation owner','owner',true);
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 ('cf300000-0000-4000-8000-000000000001','cf200000-0000-4000-8000-000000000001','HOLD-FLOW','Hold workflow site','cf100000-0000-4000-8000-000000000001'),
 ('cf300000-0000-4000-8000-000000000002','cf200000-0000-4000-8000-000000000002','HOLD-OTHER','Other organisation site','cf100000-0000-4000-8000-000000000006');
insert into public.contract_assignments(contract_id,organisation_id,user_id) values
 ('cf300000-0000-4000-8000-000000000001','cf200000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000002'),
 ('cf300000-0000-4000-8000-000000000001','cf200000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000003');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000001"}',true);
select public.create_locations('cf300000-0000-4000-8000-000000000001',gen_random_uuid(),null,
 '[{"name":"Workflow Floor","children":[{"name":"Workflow Bathroom"},{"name":"Unrelated Room"}]}]');
select id as floor from public.work_areas where name='Workflow Floor' \gset
select id as bathroom from public.work_areas where name='Workflow Bathroom' \gset
select id as unrelated from public.work_areas where name='Unrelated Room' \gset
select public.create_work_package(:'floor',gen_random_uuid(),'{"name":"Workflow tiling package","quantity":1,"unit":"m2"}') as package \gset
select public.create_operative(gen_random_uuid(),'{"display_name":"Active hold repair operative","engagement":"direct_employee","user_id":"cf100000-0000-4000-8000-000000000004"}') as person \gset
insert into public.package_assignments(organisation_id,contract_id,work_package_id,user_id)
 values('cf200000-0000-4000-8000-000000000001','cf300000-0000-4000-8000-000000000001',:'package','cf100000-0000-4000-8000-000000000004');
select gen_random_uuid() as doc \gset
insert into public.document_revisions(id,organisation_id,contract_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes)
 values(:'doc','cf200000-0000-4000-8000-000000000001','cf300000-0000-4000-8000-000000000001','HOLD-FLOW-SPEC',1,'Approved installation specification','operational',
 'cf200000-0000-4000-8000-000000000001/cf300000-0000-4000-8000-000000000001/operational/contract/'||:'doc'||'.pdf',repeat('d',64),'application/pdf',8);
reset role;
insert into storage.objects(bucket_id,name,owner,metadata)
 select 'tilespec-evidence',object_path,created_by,jsonb_build_object('size',bytes,'mimetype',mime_type) from public.document_revisions where id=:'doc';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.complete_document_upload(:'doc','cf100000-0000-4000-8000-000000000001',repeat('d',64));
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000002"}',true);
select jsonb_build_object('contract_id','cf300000-0000-4000-8000-000000000001','work_area_id',:'bathroom','work_package_id',:'package',
 'stage','installation','hold_type','quality','category','Waterproofing inspection failed','severity','major',
 'reason','Waterproofing requires correction before tiling','required_action','Correct and inspect the waterproofing system',
 'document_ids','[]'::jsonb,'evidence_explanation','Immediate isolation recorded while safe access for photographs is arranged') as hold_data \gset
-- A/B/I: a mandatory waterproofing check is a real configured hold point.
select set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000001"}',true);
select public.create_location_inspection_template(gen_random_uuid(),jsonb_build_object('contract_id','cf300000-0000-4000-8000-000000000001',
 'work_area_id',:'bathroom','stage','installation','title','Approved waterproofing hold point','specification_reference','HOLD-FLOW-SPEC','specification_revision','1','wet_area',true,
 'checklist','[{"label":"Waterproofing meets the approved system","wet_only":false,"mandatory":true,"hold_point":true,"evidence_required":true}]'::jsonb)) as template \gset
select public.configure_inspection_requirement(gen_random_uuid(),jsonb_build_object('contract_id','cf300000-0000-4000-8000-000000000001',
 'work_area_id',:'bathroom','stage','installation','applicability','required','template_id',:'template','approved_document_ids',jsonb_build_array(:'doc'),
 'basis','The approved manufacturer system requires this waterproofing check before tiling')) as requirement \gset
select test.assert(public.work_release_status('cf300000-0000-4000-8000-000000000001',:'bathroom','installation',:'package')->>'status'='awaiting_inspection',
 'I: configured mandatory inspection remains outstanding until a real result is recorded');
select set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000002"}',true);
select public.record_location_inspection(gen_random_uuid(),jsonb_build_object('contract_id','cf300000-0000-4000-8000-000000000001','work_area_id',:'bathroom',
 'work_package_id',:'package','template_id',:'template','answers',jsonb_build_array(jsonb_build_object('status','issue','note','Waterproofing membrane is visibly incomplete','document_ids',jsonb_build_array(:'doc'))),'allocation_ids','[]'::jsonb)) as failed \gset
select md5(to_jsonb(i)::text) as failed_hash from public.location_inspections i where id=:'failed' \gset
select public.create_work_hold(gen_random_uuid(),:'hold_data'::jsonb||jsonb_build_object('source_inspection_id',:'failed')) as hold \gset
select test.assert(public.work_release_status('cf300000-0000-4000-8000-000000000001',:'bathroom','installation',:'package')->>'status'='blocked_quality',
 'A/I: a saved quality hold and failed mandatory inspection block the affected tiling');
select test.assert(jsonb_array_length(public.work_release_status('cf300000-0000-4000-8000-000000000001',:'unrelated','installation',null)->'holds')=0,
 'B: the bathroom restriction does not silently stop an unrelated room');
select public.transition_work_hold(:'hold',gen_random_uuid(),1,'assign',jsonb_build_object('note','Assign waterproofing correction to the active operative','operative_id',:'person',
 'required_action','Complete waterproofing and arrange physical reinspection','target_date',private.site_today()::text));
select public.transition_work_hold(:'hold',gen_random_uuid(),2,'submit_correction',jsonb_build_object('note','Waterproofing work completed with supporting document evidence',
 'document_ids',jsonb_build_array(:'doc'),'completed_at',to_jsonb(now())#>>'{}'));
select public.transition_work_hold(:'hold',gen_random_uuid(),3,'request_release','{"note":"Corrected waterproofing is ready for independent release review"}');
select set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000001"}',true);
select test.expect_error(format('select public.transition_work_hold(%L,gen_random_uuid(),4,''release'',''{"note":"Office must not bypass the failed mandatory check"}'')',:'hold'),array['22023'],
 'I: office release refuses an unresolved mandatory hold-point failure');
select set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000002"}',true);
select public.record_location_inspection(gen_random_uuid(),jsonb_build_object('contract_id','cf300000-0000-4000-8000-000000000001','work_area_id',:'bathroom',
 'work_package_id',:'package','template_id',:'template','answers',jsonb_build_array(jsonb_build_object('status','pass','note','Updated waterproofing inspection verified against the manufacturer system',
 'document_ids',jsonb_build_array(:'doc'))),'allocation_ids','[]'::jsonb)) as passed \gset
-- H: a second overlapping hold is independently visible and remains effective.
select public.create_work_hold(gen_random_uuid(),:'hold_data'::jsonb||'{"category":"Preparation concern","reason":"Separate substrate preparation concern requires correction"}') as overlap \gset
select test.assert(jsonb_array_length(public.hold_context(:'hold')->'overlapping_holds')=1,'H: release review prominently includes another overlapping restriction');
select set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000001"}',true);
select public.transition_work_hold(:'hold',gen_random_uuid(),4,'release','{"note":"Independent office reviewer verified corrected work and saved passing reinspection"}');
select test.assert((select status='released' from public.work_holds where id=:'hold') and not(public.work_release_status('cf300000-0000-4000-8000-000000000001',:'bathroom','installation',:'package')->>'authorised')::boolean,
 'E/H: one hold can be independently released while another prevents a false work authorisation');
select test.assert((select md5(to_jsonb(i)::text)=:'failed_hash' from public.location_inspections i where id=:'failed'),
 'N: linking and releasing a hold leaves the original failed inspection unchanged');
select test.assert((public.hold_register(jsonb_build_object('contract_id','cf300000-0000-4000-8000-000000000001','location_id',:'bathroom','stage','installation'),0)->'counts'->>'active_quality')::integer=1,
 'P: filtered office counts reflect the genuinely remaining quality hold');
select test.assert((public.hold_register('{"contract_id":"cf300000-0000-4000-8000-000000000001","stage":"installation"}',0)->'quality_counts'->>'failed_inspections')::integer=0,
 'P: failed-inspection dashboard count uses the latest saved result instead of counting superseded failures forever');
-- Authorised record of an entry error does not bypass mandatory requirements.
select public.transition_work_hold(:'overlap',gen_random_uuid(),1,'entered_in_error','{"note":"Independent office investigation verified the second finding was recorded against the wrong location"}');
select test.assert((public.work_release_status('cf300000-0000-4000-8000-000000000001',:'bathroom','installation',:'package')->>'authorised')::boolean,
 'E: saved independent release with passing mandatory requirements authorises only the specified scope');
select test.assert(public.work_release_status('cf300000-0000-4000-8000-000000000001',:'bathroom','installation',:'package')->'release'->>'reviewer'='cf100000-0000-4000-8000-000000000001',
 'E/M: work-release status retains the actual independent reviewer and release decision');
-- Revised applicability cannot inherit an authorisation for a different regime.
select public.configure_inspection_requirement(gen_random_uuid(),jsonb_build_object('contract_id','cf300000-0000-4000-8000-000000000001',
 'work_area_id',:'bathroom','stage','installation','applicability','required','template_id',:'template','approved_document_ids',jsonb_build_array(:'doc'),
 'basis','A reviewed revised specification basis requires another explicit decision','supersedes_id',:'requirement'));
select test.assert(not(public.work_release_status('cf300000-0000-4000-8000-000000000001',:'bathroom','installation',:'package')->>'authorised')::boolean,
 'I: revising the approved requirement regime invalidates the older office release proof');
select set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000002"}',true);
select public.record_location_inspection(gen_random_uuid(),jsonb_build_object('contract_id','cf300000-0000-4000-8000-000000000001','work_area_id',:'bathroom',
 'work_package_id',:'package','template_id',:'template','answers',jsonb_build_array(jsonb_build_object('status','pass','note','Physical reinspection meets the revised specification requirement',
 'document_ids',jsonb_build_array(:'doc'))),'allocation_ids','[]'::jsonb));
select test.assert((public.inspection_requirements('cf300000-0000-4000-8000-000000000001',:'bathroom',:'package','installation')->>'passed')::boolean
 and public.work_release_status('cf300000-0000-4000-8000-000000000001',:'bathroom','installation',:'package')->>'status'='not_assessed'
 and public.work_release_status('cf300000-0000-4000-8000-000000000001',:'bathroom','installation',:'package')->'release'='null'::jsonb,
 'I: a passing inspection under a newer requirement never revives the earlier independent release authorisation');
select public.create_work_hold(gen_random_uuid(),:'hold_data'::jsonb||'{"category":"Revised specification review","reason":"New specification approval needs a fresh independent work release"}') as revised_hold \gset
select public.transition_work_hold(:'revised_hold',gen_random_uuid(),1,'assign',jsonb_build_object('note','Assign a check against the revised specification','operative_id',:'person',
 'required_action','Verify corrected work against the new approved requirement','target_date',private.site_today()::text));
select public.transition_work_hold(:'revised_hold',gen_random_uuid(),2,'submit_correction',jsonb_build_object('note','Corrected work checked against the revised requirement',
 'document_ids',jsonb_build_array(:'doc'),'completed_at',to_jsonb(now())#>>'{}'));
select public.transition_work_hold(:'revised_hold',gen_random_uuid(),3,'request_release','{"note":"Request a fresh independent authorisation against the revised specification"}');
select set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000001"}',true);
select public.transition_work_hold(:'revised_hold',gen_random_uuid(),4,'release','{"note":"Independent review explicitly confirms the current specification requirement and corrected work"}');
select test.assert((public.work_release_status('cf300000-0000-4000-8000-000000000001',:'bathroom','installation',:'package')->>'authorised')::boolean
 and public.work_release_status('cf300000-0000-4000-8000-000000000001',:'bathroom','installation',:'package')->'release'->>'hold_id'=:'revised_hold'
 and (select status='released' from public.work_holds where id=:'hold'),
 'E/I: only a new independent decision restores authorisation after a requirement revision, preserving the previous decision');
-- C: broader safety stops are distinct and cover every child and stage.
select set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000002"}',true);
select public.create_work_hold(gen_random_uuid(),:'hold_data'::jsonb||jsonb_build_object('work_area_id',:'floor','work_package_id',null,'stage',null,
 'hold_type','safety','severity','critical','category','Unsafe access','reason','Unsafe access platform affects every room on this floor','required_action','Make the floor access safe and obtain designated authority acknowledgement')) as safety \gset
select test.assert(public.work_release_status('cf300000-0000-4000-8000-000000000001',:'unrelated','grouting',null)->>'status'='stopped_safety',
 'C: a floor-level safety stop prevents unrelated activities inside the affected floor from appearing released');
select test.assert(public.hold_context(:'safety')->'requirements' ? 'scopes' and (public.hold_context(:'safety')->'requirements'->>'unknown')::boolean,
 'C/I: broad release review shows saved per-location and per-stage requirements, including unknown applicability');
select public.create_work_hold(gen_random_uuid(),:'hold_data'::jsonb||jsonb_build_object('hold_type','safety','severity','critical','category','Local safety concern')) as narrow_safety \gset
select set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000001"}',true);
select test.expect_error(format('select public.transition_work_hold(%L,gen_random_uuid(),1,''supersede'',jsonb_build_object(''note'',''Try shrinking a broader safety restriction'',''successor_id'',%L))',:'safety',:'narrow_safety'),array['22023'],
 'C: superseding a safety stop cannot shrink its location, activity or safety scope');
select public.transition_work_hold(:'narrow_safety',gen_random_uuid(),1,'supersede',jsonb_build_object('note','The active broader floor stop fully includes this local stop','successor_id',:'safety'));
select test.assert((select status='superseded' and superseded_by=:'safety' from public.work_holds where id=:'narrow_safety'),
 'C/M: a superseded hold permanently links to the active broader successor instead of deleting its history');
select test.assert((public.hold_register('{"hold_type":"safety"}',0)->'counts'->>'active_safety')::integer=1,
 'P: safety dashboard counts active restrictions without double-counting superseded historical holds');
-- Safety release requires the external authority acknowledgement in addition
-- to TileSPEC's independent office decision.
select public.configure_inspection_requirement(gen_random_uuid(),jsonb_build_object('contract_id','cf300000-0000-4000-8000-000000000001',
 'work_area_id',:'unrelated','stage','installation','applicability','not_required','approved_document_ids',jsonb_build_array(:'doc'),
 'basis','Approved specification explicitly states this room activity has no additional mandatory inspection'));
select set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000002"}',true);
select public.create_work_hold(gen_random_uuid(),:'hold_data'::jsonb||jsonb_build_object('work_area_id',:'unrelated','hold_type','safety','severity','critical','category','Electrical hazard')) as acknowledged_stop \gset
select public.transition_work_hold(:'acknowledged_stop',gen_random_uuid(),1,'assign',jsonb_build_object('note','Assign correction of the local hazard','operative_id',:'person',
 'required_action','Remove the local hazard and obtain the designated safety authority acknowledgement','target_date',private.site_today()::text));
select public.transition_work_hold(:'acknowledged_stop',gen_random_uuid(),2,'submit_correction',jsonb_build_object('note','Local hazard correction recorded with verified supporting document',
 'document_ids',jsonb_build_array(:'doc'),'completed_at',to_jsonb(now())#>>'{}'));
select public.transition_work_hold(:'acknowledged_stop',gen_random_uuid(),3,'request_release','{"note":"Local hazard corrected and ready for independent safety release review"}');
select set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000001"}',true);
select test.expect_error(format('select public.transition_work_hold(%L,gen_random_uuid(),4,''release'',''{"note":"Internal office approval cannot override principal contractor control"}'')',:'acknowledged_stop'),array['23514'],
 'C/E: safety release requires recorded principal-contractor or designated authority acknowledgement');
select public.transition_work_hold(:'acknowledged_stop',gen_random_uuid(),4,'release',jsonb_build_object('note','Independent office review with the designated authority acknowledgement recorded',
 'authority_name','Principal contractor representative','authority_role','Designated site safety authority','authority_reference','Recorded authorisation SAFE-REF-001 for this local hazard only',
 'authority_acknowledged_at',to_jsonb(now())#>>'{}'));
select test.assert((select status='released' and authority_acknowledgement->>'reference' like '%SAFE-REF-001%' from public.work_holds where id=:'acknowledged_stop'),
 'C/E/M: the safety authority name, role, reference, acknowledgement and TileSPEC reviewer persist');
select test.assert(public.work_release_status('cf300000-0000-4000-8000-000000000001',:'unrelated','installation',:'package')->>'status'='stopped_safety',
 'H: releasing a local safety stop never clears the separate floor-wide safety restriction');
-- J: a submitted critical snag escalates without silently creating a hold.
select set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000002"}',true);
select public.create_snag(gen_random_uuid(),jsonb_build_object('contract_id','cf300000-0000-4000-8000-000000000001','work_area_id',:'unrelated','work_package_id',:'package',
 'stage','installation','category','Serious substrate concern','severity','critical','description','Serious substrate defect needs a checked correction before this tiling can proceed',
 'required_rectification','Correct the substrate and obtain independent reinspection')) as critical \gset
select public.reserve_snag_photo(:'critical',gen_random_uuid(),'original',jsonb_build_object('mime_type','image/png','bytes',8,'sha256',repeat('c',64))) as critical_photo \gset
reset role;
create function pg_temp.verify_workflow_snag_photo(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.supervisor_issue_photos; claims text:=current_setting('request.jwt.claims',true);
begin
 select * into p from public.supervisor_issue_photos where id=p_id;
 insert into storage.objects(bucket_id,name,owner,metadata) values('supervisor-evidence',p.object_path,p.actor_id,jsonb_build_object('size',p.bytes,'mimetype',p.mime_type));
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform public.complete_snag_photo(p.id,p.actor_id,p.sha256);
 perform set_config('request.jwt.claims',claims,true);
end $$;
set local role authenticated;
select pg_temp.verify_workflow_snag_photo(:'critical_photo');
select public.transition_snag(:'critical',gen_random_uuid(),1,'submit',jsonb_build_object('note','Critical snag explicitly submitted with original verified evidence','photo_ids',jsonb_build_array(:'critical_photo')));
select test.assert((select count(*)=0 from public.work_holds where source_snag_id=:'critical'),
 'J: a critical snag is persisted and escalated without automatically imposing a formal safety stop');
select public.create_work_hold(gen_random_uuid(),:'hold_data'::jsonb||jsonb_build_object('work_area_id',:'unrelated','source_snag_id',:'critical','category','Linked critical substrate concern')) as linked_hold \gset
select test.assert((select source_snag_id=:'critical' and status='active' from public.work_holds where id=:'linked_hold'),
 'J: an explicit authorised stop preserves its link to the critical defect');
select public.transition_work_hold(:'linked_hold',gen_random_uuid(),1,'assign',jsonb_build_object('note','Assign the critical defect correction','operative_id',:'person',
 'required_action','Correct the linked critical defect before requesting release','target_date',private.site_today()::text));
select public.transition_work_hold(:'linked_hold',gen_random_uuid(),2,'submit_correction',jsonb_build_object('note','Supporting correction evidence submitted while linked snag reinspection remains outstanding',
 'document_ids',jsonb_build_array(:'doc'),'completed_at',to_jsonb(now())#>>'{}'));
select public.transition_work_hold(:'linked_hold',gen_random_uuid(),3,'request_release','{"note":"Request review while keeping the unresolved linked critical finding visible"}');
select set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000001"}',true);
select test.expect_error(format('select public.transition_work_hold(%L,gen_random_uuid(),4,''release'',''{"note":"Office cannot skip the unresolved linked critical snag"}'')',:'linked_hold'),array['23514'],
 'J: saved correction evidence alone cannot bypass an unresolved critical or linked snag');
select test.assert((public.hold_register('{"stage":"installation"}',0)->'quality_counts'->>'critical_snags')::integer=1,
 'P: cross-site office quality counts use the current scoped critical snag records');
rollback;
