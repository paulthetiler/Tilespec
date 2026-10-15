-- Real role/RLS checks for formal restrictions and private, immutable evidence.
-- The runner creates a disposable local PostgreSQL cluster; no hosted DB exists.
begin;
insert into auth.users(id,email) values
 ('ce100000-0000-4000-8000-000000000001','hold-security-owner@example.invalid'),
 ('ce100000-0000-4000-8000-000000000002','hold-security-supervisor@example.invalid'),
 ('ce100000-0000-4000-8000-000000000003','hold-security-manager@example.invalid'),
 ('ce100000-0000-4000-8000-000000000004','hold-security-installer@example.invalid'),
 ('ce100000-0000-4000-8000-000000000005','hold-security-unassigned@example.invalid'),
 ('ce100000-0000-4000-8000-000000000006','hold-security-outsider@example.invalid');
insert into public.organisations(id,name) values
 ('ce200000-0000-4000-8000-000000000001','Hold security contractor'),
 ('ce200000-0000-4000-8000-000000000002','Other hold security contractor');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access) values
 ('ce200000-0000-4000-8000-000000000001','ce100000-0000-4000-8000-000000000001','Security office','owner',true),
 ('ce200000-0000-4000-8000-000000000001','ce100000-0000-4000-8000-000000000002','Security supervisor','supervisor',false),
 ('ce200000-0000-4000-8000-000000000001','ce100000-0000-4000-8000-000000000003','Security independent manager','contracts_manager',false),
 ('ce200000-0000-4000-8000-000000000001','ce100000-0000-4000-8000-000000000004','Security repair installer','subcontract_installer',false),
 ('ce200000-0000-4000-8000-000000000001','ce100000-0000-4000-8000-000000000005','Unassigned site supervisor','supervisor',false),
 ('ce200000-0000-4000-8000-000000000002','ce100000-0000-4000-8000-000000000006','Other organisation owner','owner',true);
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 ('ce300000-0000-4000-8000-000000000001','ce200000-0000-4000-8000-000000000001','HOLD-SEC','Hold security site','ce100000-0000-4000-8000-000000000001'),
 ('ce300000-0000-4000-8000-000000000002','ce200000-0000-4000-8000-000000000002','HOLD-OTHER','Other organisation site','ce100000-0000-4000-8000-000000000006');
insert into public.contract_assignments(contract_id,organisation_id,user_id) values
 ('ce300000-0000-4000-8000-000000000001','ce200000-0000-4000-8000-000000000001','ce100000-0000-4000-8000-000000000002'),
 ('ce300000-0000-4000-8000-000000000001','ce200000-0000-4000-8000-000000000001','ce100000-0000-4000-8000-000000000003');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000001"}',true);
select public.create_locations('ce300000-0000-4000-8000-000000000001',gen_random_uuid(),null,
 '[{"name":"Security Floor","children":[{"name":"Security Bathroom"},{"name":"Unrelated Room"}]}]');
select id as floor from public.work_areas where name='Security Floor' \gset
select id as bathroom from public.work_areas where name='Security Bathroom' \gset
select id as unrelated from public.work_areas where name='Unrelated Room' \gset
select public.create_work_package(:'floor',gen_random_uuid(),'{"name":"Security tiling package","quantity":1,"unit":"m2"}') as package \gset
select public.create_operative(gen_random_uuid(),'{"display_name":"Active hold repair operative","engagement":"direct_employee","user_id":"ce100000-0000-4000-8000-000000000004"}') as person \gset
insert into public.package_assignments(organisation_id,contract_id,work_package_id,user_id)
 values('ce200000-0000-4000-8000-000000000001','ce300000-0000-4000-8000-000000000001',:'package','ce100000-0000-4000-8000-000000000004');
select gen_random_uuid() as doc \gset
insert into public.document_revisions(id,organisation_id,contract_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes)
 values(:'doc','ce200000-0000-4000-8000-000000000001','ce300000-0000-4000-8000-000000000001','HOLD-SEC-SPEC',1,'Approved installation specification','operational',
 'ce200000-0000-4000-8000-000000000001/ce300000-0000-4000-8000-000000000001/operational/contract/'||:'doc'||'.pdf',repeat('d',64),'application/pdf',8);
reset role;
insert into storage.objects(bucket_id,name,owner,metadata)
 select 'tilespec-evidence',object_path,created_by,jsonb_build_object('size',bytes,'mimetype',mime_type) from public.document_revisions where id=:'doc';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.complete_document_upload(:'doc','ce100000-0000-4000-8000-000000000001',repeat('d',64));
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000002"}',true);
select jsonb_build_object('contract_id','ce300000-0000-4000-8000-000000000001','work_area_id',:'bathroom','work_package_id',:'package',
 'stage','installation','hold_type','quality','category','Waterproofing inspection failed','severity','major',
 'reason','Waterproofing requires correction before tiling','required_action','Correct and inspect the waterproofing system',
 'document_ids','[]'::jsonb,'evidence_explanation','Immediate isolation recorded while safe access for photographs is arranged') as hold_data \gset
select gen_random_uuid() as key \gset
select public.create_work_hold(:'key',:'hold_data') as hold \gset
select test.assert((select status='active' and raised_by=auth.uid() and version=1 from public.work_holds where id=:'hold'),
 'a supervisor immediately records the affected quality stop without waiting for evidence or office approval');
select test.expect_error(format('select public.create_work_hold(%L,%L)',:'key',(:'hold_data'::jsonb||'{"reason":"Changed original reason"}')::text),array['22023'],
 'reusing a stop request key cannot silently change original findings');
select test.expect_error(format('update public.work_holds set status=''released'' where id=%L',:'hold'),array['42501'],
 'a supervisor cannot bypass the release RPC with direct UPDATE');
select test.expect_error(format('select public.transition_work_hold(%L,gen_random_uuid(),1,''release'',''{"note":"Try skipping correction and independent office review"}'')',:'hold'),array['42501','22023'],
 'a supervisor cannot authorise work through a direct release RPC');
select test.expect_error(format('select public.reserve_hold_photo(%L,gen_random_uuid(),''original'',''{"mime_type":"image/svg+xml","bytes":8,"sha256":"%s"}'')',:'hold',repeat('a',64)),array['22023'],
 'hold evidence rejects active image content types');
select test.expect_error(format('select public.reserve_hold_photo(%L,gen_random_uuid(),''original'',''{"mime_type":"image/png","bytes":4194305,"sha256":"%s"}'')',:'hold',repeat('a',64)),array['22023'],
 'hold evidence rejects files above the established four megabyte limit');
select public.reserve_hold_photo(:'hold',gen_random_uuid(),'original',jsonb_build_object('mime_type','image/png','bytes',8,'sha256',repeat('a',64))) as original_photo \gset
select object_path as original_path from public.hold_photos where id=:'original_photo' \gset
select test.expect_error(format('insert into storage.objects(bucket_id,name,owner,metadata) values(''supervisor-evidence'',%L,auth.uid(),''{}'')',replace(:'original_path',:'original_photo','00000000-0000-4000-8000-000000000001')),array['42501'],
 'a private hold object requires an exact caller-owned reservation');
insert into storage.objects(bucket_id,name,owner,metadata) values('supervisor-evidence',:'original_path',auth.uid(),'{"size":9,"mimetype":"image/png"}');
select test.assert((select count(*)=0 from storage.objects where name=:'original_path'),
 'unverified pending hold bytes are not visible through caller Storage SELECT');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select test.expect_error(format('select public.complete_hold_photo(%L,%L,repeat(''a'',64))',:'original_photo','ce100000-0000-4000-8000-000000000002'),array['23514'],
 'trusted hold completion rejects metadata that differs from the reserved bytes');
select test.expect_error(format('select public.complete_hold_photo(%L,%L,repeat(''a'',64))',:'original_photo','ce100000-0000-4000-8000-000000000003'),array['42501'],
 'trusted hold completion requires the exact reserved uploader');
select test.expect_error(format('select public.complete_hold_photo(%L,%L,repeat(''b'',64))',:'original_photo','ce100000-0000-4000-8000-000000000002'),array['42501'],
 'trusted hold completion requires the server-verified content digest');
reset role;
update storage.objects set metadata='{"size":8,"mimetype":"image/png"}' where name=:'original_path';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.complete_hold_photo(:'original_photo','ce100000-0000-4000-8000-000000000002',repeat('a',64));
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000002"}',true);
select public.transition_work_hold(:'hold',gen_random_uuid(),1,'add_original_evidence',jsonb_build_object('note','Original concern now supported by a verified photograph','photo_ids',jsonb_build_array(:'original_photo'),'document_ids','[]'::jsonb));
select public.transition_work_hold(:'hold',gen_random_uuid(),2,'assign',jsonb_build_object('note','Allocate correction to the scoped repair operative','operative_id',:'person',
 'required_action','Correct the waterproofing defect before independent inspection','target_date',private.site_today()::text));
select id as supervisor_notification from public.hold_notifications where hold_id=:'hold' order by id limit 1 \gset
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000005"}',true);
select test.assert((select count(*)=0 from public.work_holds) and (select count(*)=0 from public.hold_photos),
 'same-organisation staff without a site assignment cannot see its hold records or evidence metadata');
select test.expect_error(format('select public.transition_work_hold(%L,gen_random_uuid(),3,''release'',''{"note":"Try releasing another unassigned site"}'')',:'hold'),array['42501'],
 'unassigned staff cannot release another site');
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000006"}',true);
select test.assert((select count(*)=0 from public.work_holds) and (select count(*)=0 from public.work_hold_events)
 and (select count(*)=0 from storage.objects where name=:'original_path'),
 'another organisation cannot see holds, audit decisions or private evidence');
select test.assert((public.hold_notifications(null,false)->>'total')::integer=0,
 'cross-organisation notification counts reveal no stop or approval alerts');
select test.expect_error(format('select public.mark_hold_notification_read(%s,gen_random_uuid())',:'supervisor_notification'),array['42501'],
 'another organisation cannot acknowledge someone else stop notification');
select test.expect_error(format('select public.create_work_hold(gen_random_uuid(),%L)',:'hold_data'),array['42501'],
 'an owner cannot raise stops on another organisation site');
select test.expect_error(format('select public.transition_work_hold(%L,gen_random_uuid(),3,''release'',''{"note":"Try authorising another organisation work"}'')',:'hold'),array['42501'],
 'an owner cannot authorise another organisation work');
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000004"}',true);
select test.assert(private.can_read_work_hold(:'hold') and private.is_hold_corrector(:'hold'),
 'an active scoped assigned operative can see the restriction and submit correction');
select test.expect_error(format('select public.create_work_hold(gen_random_uuid(),%L)',:'hold_data'),array['42501'],
 'installer package access does not grant formal stop creation authority');
select test.expect_error(format('select public.transition_work_hold(%L,gen_random_uuid(),3,''release'',''{"note":"Attempt installer self-approval"}'')',:'hold'),array['42501'],
 'an installer cannot release a formal hold');
select test.assert((select count(*)=1 from storage.objects where name=:'original_path'),
 'the assigned installer may review verified original evidence privately');
select test.assert(jsonb_array_length(public.hold_context(:'hold')->'inspections')=0
 and not exists(select 1 from jsonb_array_elements(public.hold_context(:'hold')->'events') e
  where e->'snapshot' ? 'mandatory_review' or e->'snapshot' ? 'document_ids' or e->'snapshot' ? 'original_document_ids'),
 'installer hold context removes scope-wide inspection and protected document review snapshots');
select test.expect_error('select snapshot from public.work_hold_events',array['42501'],
 'raw scope-wide hold review snapshots have no direct authenticated SELECT grant');
select id as installer_notification from public.hold_notifications where hold_id=:'hold' order by id limit 1 \gset
select gen_random_uuid() as notification_request \gset
select public.mark_hold_notification_read(:'installer_notification',:'notification_request');
select read_at::text as read_at from public.hold_notification_reads where notification_id=:'installer_notification' \gset
select public.mark_hold_notification_read(:'installer_notification',:'notification_request');
select test.assert((select count(*)=1 and min(read_at::text)=:'read_at' from public.hold_notification_reads where notification_id=:'installer_notification'),
 'notification acknowledgement safely retries without duplicating or rewriting the saved read time');
select test.expect_error(format('insert into public.hold_notification_reads(notification_id,user_id) values(%s,auth.uid())',:'installer_notification'),array['42501'],
 'clients cannot write notification read state outside the checked RPC');

select public.reserve_hold_photo(:'hold',gen_random_uuid(),'correction',jsonb_build_object('mime_type','image/png','bytes',8,'sha256',repeat('b',64))) as correction_photo \gset
select object_path as correction_path from public.hold_photos where id=:'correction_photo' \gset
insert into storage.objects(bucket_id,name,owner,metadata) values('supervisor-evidence',:'correction_path',auth.uid(),'{"size":8,"mimetype":"image/png"}');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.complete_hold_photo(:'correction_photo','ce100000-0000-4000-8000-000000000004',repeat('b',64));
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000004"}',true);
select test.expect_error(format('select public.transition_work_hold(%L,gen_random_uuid(),3,''submit_correction'',''{"note":"A claimed correction with no saved evidence","photo_ids":[],"document_ids":[],"completed_at":"%s"}'')',:'hold',to_jsonb(now())#>>'{}'),array['22023'],
 'a correction cannot claim verification from an explanation without saved photographs or documents');
select public.transition_work_hold(:'hold',gen_random_uuid(),3,'submit_correction',jsonb_build_object('note','Assigned operative completed the corrective waterproofing work',
 'photo_ids',jsonb_build_array(:'correction_photo'),'document_ids','[]'::jsonb,'completed_at',to_jsonb(now())));
select public.transition_work_hold(:'hold',gen_random_uuid(),4,'request_release','{"note":"Corrected affected work is ready for independent office review"}');
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000001"}',true);
select test.expect_error(format('select public.transition_work_hold(%L,gen_random_uuid(),5,''release'',''{"note":"Try bypassing unknown mandatory applicability"}'')',:'hold'),array['22023'],
 'office release cannot bypass unconfigured mandatory inspection applicability');
select public.configure_inspection_requirement(gen_random_uuid(),jsonb_build_object('contract_id','ce300000-0000-4000-8000-000000000001','work_area_id',:'bathroom',
 'work_package_id',:'package','stage','installation','applicability','not_required','approved_document_ids',jsonb_build_array(:'doc'),
 'basis','Approved contract specification explicitly permits this activity without an additional mandatory check'));
select public.transition_work_hold(:'hold',gen_random_uuid(),5,'release','{"note":"Independent office review verified correction and approved specification applicability"}');
select test.assert((select status='released' and released_by=auth.uid() and version=6 from public.work_holds where id=:'hold'),
 'an independent office reviewer can release specified work after all server requirements are satisfied');
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000004"}',true);
select test.expect_error(format('select public.reserve_hold_photo(%L,gen_random_uuid(),''correction'',''{"mime_type":"image/png","bytes":8,"sha256":"%s"}'')',:'hold',repeat('c',64)),array['42501'],
 'released work cannot accept a new misleading correction photograph');
-- An office person also cannot authorise a stop that they personally raised.
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000001"}',true);
select public.create_work_hold(gen_random_uuid(),:'hold_data') as office_raised_hold \gset
select public.transition_work_hold(:'office_raised_hold',gen_random_uuid(),1,'assign',jsonb_build_object('note','Assign correction of an office-raised quality hold',
 'operative_id',:'person','required_action','Correct the defect and submit reviewed evidence','target_date',private.site_today()::text));
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000002"}',true);
select public.transition_work_hold(:'office_raised_hold',gen_random_uuid(),2,'submit_correction',jsonb_build_object('note','Supervisor records corrected work on the office-raised restriction',
 'photo_ids','[]'::jsonb,'document_ids',jsonb_build_array(:'doc'),'completed_at',to_jsonb(now())));
select public.transition_work_hold(:'office_raised_hold',gen_random_uuid(),3,'request_release','{"note":"Supervisor requests independent review of the office-raised hold"}');
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000001"}',true);
select test.expect_error(format('select public.transition_work_hold(%L,gen_random_uuid(),4,''release'',''{"note":"Try releasing the hold personally raised by this owner"}'')',:'office_raised_hold'),array['42501'],
 'office permission does not let the original raiser authorise their own stop');
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000003"}',true);
select public.transition_work_hold(:'office_raised_hold',gen_random_uuid(),4,'release','{"note":"Independent manager reviewed the office-raised hold and supervisor correction"}');
-- Independence applies to every correction submitter, including an office
-- person whose previous failed attempt was superseded by another cycle.
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000002"}',true);
select public.create_work_hold(gen_random_uuid(),:'hold_data') as independence_hold \gset
select public.transition_work_hold(:'independence_hold',gen_random_uuid(),1,'assign',jsonb_build_object('note','Assign an operative before recording corrective evidence',
 'operative_id',:'person','required_action','Correct waterproofing to the approved specification','target_date',private.site_today()::text));
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000001"}',true);
select public.transition_work_hold(:'independence_hold',gen_random_uuid(),2,'submit_correction',jsonb_build_object('note','Office member records the first attempted correction',
 'photo_ids','[]'::jsonb,'document_ids',jsonb_build_array(:'doc'),'completed_at',to_jsonb(now())));
select public.transition_work_hold(:'independence_hold',gen_random_uuid(),3,'request_release','{"note":"Request independent review of the first correction"}');
select test.expect_error(format('select public.transition_work_hold(%L,gen_random_uuid(),4,''release'',''{"note":"Try office self-approval of own correction"}'')',:'independence_hold'),array['42501'],
 'office permission does not let a corrective-action submitter authorise their own release');
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000003"}',true);
select public.transition_work_hold(:'independence_hold',gen_random_uuid(),4,'reject_release','{"note":"Independent review rejected the first corrective attempt"}');
select test.assert((select status='active' and correction_cycle=2 from public.work_holds where id=:'independence_hold'),
 'rejected release stays blocking and begins a separate corrective cycle');
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000004"}',true);
select public.reserve_hold_photo(:'independence_hold',gen_random_uuid(),'correction',jsonb_build_object('mime_type','image/png','bytes',8,'sha256',repeat('e',64))) as second_correction_photo \gset
select object_path as second_correction_path from public.hold_photos where id=:'second_correction_photo' \gset
insert into storage.objects(bucket_id,name,owner,metadata) values('supervisor-evidence',:'second_correction_path',auth.uid(),'{"size":8,"mimetype":"image/png"}');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.complete_hold_photo(:'second_correction_photo','ce100000-0000-4000-8000-000000000004',repeat('e',64));
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000004"}',true);
select public.transition_work_hold(:'independence_hold',gen_random_uuid(),5,'submit_correction',jsonb_build_object('note','Installer records an independently photographed second correction',
 'photo_ids',jsonb_build_array(:'second_correction_photo'),'document_ids','[]'::jsonb,'completed_at',to_jsonb(now())));
select public.transition_work_hold(:'independence_hold',gen_random_uuid(),6,'request_release','{"note":"Second attempt is ready for independent office review"}');
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000001"}',true);
select test.expect_error(format('select public.transition_work_hold(%L,gen_random_uuid(),7,''release'',''{"note":"Try releasing after another person submitted the latest correction"}'')',:'independence_hold'),array['42501'],
 'a previous office correction submitter remains disqualified after rejection and another corrective cycle');
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000003"}',true);
select public.transition_work_hold(:'independence_hold',gen_random_uuid(),7,'release','{"note":"Independent manager verified the complete history and second corrected work"}');
select test.assert((select count(*)=2 from public.work_hold_events where hold_id=:'independence_hold' and action='submit_correction')
 and (select count(*)=1 from public.work_hold_events where hold_id=:'independence_hold' and action='reject_release'),
 'all rejected and accepted correction attempts remain in permanent history');
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000001"}',true);
delete from public.package_assignments where work_package_id=:'package' and user_id='ce100000-0000-4000-8000-000000000004';
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000004"}',true);
select test.assert(not private.can_read_work_hold(:'hold') and (select count(*)=0 from storage.objects where name in (:'original_path',:'correction_path')),
 'revoking package scope immediately removes hold records and both original and correction evidence');
reset role;
-- Match the established date-effective contract helpers even when the DB
-- session calendar and the operational London calendar fall on different days.
savepoint assignment_calendar;
select case when (current_timestamp at time zone 'Pacific/Kiritimati')::date<>private.site_today()
 then 'Pacific/Kiritimati' else 'Pacific/Honolulu' end as assignment_timezone \gset
set local time zone :'assignment_timezone';
update public.contract_assignments set valid_from=current_date,valid_until=current_date
 where user_id='ce100000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000002"}',true);
select test.assert(current_date<>private.site_today() and private.can_supervise_contract('ce300000-0000-4000-8000-000000000001')
 and private.can_read_work_hold(:'hold'),
 'hold RLS and lifecycle permissions share the established contract-assignment calendar around a date boundary');
rollback to savepoint assignment_calendar;
update public.contract_assignments set valid_from=private.site_today()-10,valid_until=private.site_today()-1
 where user_id='ce100000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000002"}',true);
select test.assert(not private.can_read_work_hold(:'hold')
 and (select count(*)=0 from storage.objects where name=:'original_path')
 and (public.hold_notifications(null,false)->>'total')::integer=0,
 'expiring a supervisor site assignment immediately removes saved holds, private bytes and persisted notifications');
select test.expect_error(format('select public.hold_context(%L)',:'hold'),array['42501'],
 'an expired site assignment cannot bypass current scope through a definer context RPC');
reset role;
update public.organisation_members set active=false where user_id='ce100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ce100000-0000-4000-8000-000000000001"}',true);
select test.assert(not private.can_read_work_hold(:'hold') and (select count(*)=0 from public.work_holds),
 'deactivating even an organisation owner immediately removes formal restriction access');
reset role;
select test.expect_error(format('update public.work_holds set reason=''Rewritten original reason'' where id=%L',:'hold'),array['42501'],
 'even privileged SQL cannot rewrite the original stop finding');
select test.expect_error(format('delete from public.work_hold_events where hold_id=%L',:'hold'),array['42501'],
 'even privileged SQL cannot delete permanent restriction decisions');
select test.expect_error(format('update public.work_hold_events set note=''Rewritten approval'' where hold_id=%L',:'hold'),array['42501'],
 'even privileged SQL cannot rewrite a permanent approval decision');
select test.expect_error(format('update public.hold_photos set uploaded_at=now()+interval ''1 day'' where id=%L',:'correction_photo'),array['42501'],
 'verified hold evidence timestamps cannot be rewritten');
select test.expect_error(format('update public.hold_photos set event_id=null where id=%L',:'correction_photo'),array['42501'],
 'saved correction photographs cannot be detached from permanent correction history');
select test.assert(not has_function_privilege('anon','public.create_work_hold(uuid,jsonb)','EXECUTE')
 and not has_function_privilege('anon','public.transition_work_hold(uuid,uuid,integer,text,jsonb)','EXECUTE')
 and not has_function_privilege('authenticated','public.complete_hold_photo(uuid,uuid,text)','EXECUTE'),
 'anonymous lifecycle calls and client-side evidence certification have no EXECUTE grants');
select test.assert(not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'hold%' and cmd in ('UPDATE','DELETE','ALL')),
 'private hold evidence has no client replacement or deletion policy');
rollback;
