-- Genuine office targeting, current assignments, immutable daily handovers and
-- exact saved QA results. Disposable database only; no demo records are edited.
begin;
insert into auth.users(id,email) values
 ('db110000-0000-4000-8000-000000000001','daily-owner@example.invalid'),
 ('db110000-0000-4000-8000-000000000002','daily-dave@example.invalid'),
 ('db110000-0000-4000-8000-000000000003','daily-other-supervisor@example.invalid'),
 ('db110000-0000-4000-8000-000000000004','daily-unassigned@example.invalid'),
 ('db110000-0000-4000-8000-000000000005','daily-manager@example.invalid'),
 ('db110000-0000-4000-8000-000000000006','daily-unassigned-manager@example.invalid'),
 ('db110000-0000-4000-8000-000000000007','daily-installer@example.invalid'),
 ('db110000-0000-4000-8000-000000000008','daily-outsider@example.invalid');
insert into public.organisations(id,name) values
 ('db120000-0000-4000-8000-000000000001','Daily workflow test'),
 ('db120000-0000-4000-8000-000000000002','Other daily workflow test');
insert into public.organisation_members(organisation_id,user_id,display_name,role)
select 'db120000-0000-4000-8000-000000000001',id,name,role::public.operations_role from (values
 ('db110000-0000-4000-8000-000000000001'::uuid,'Daily owner','owner'),
 ('db110000-0000-4000-8000-000000000002'::uuid,'Dave daily','supervisor'),
 ('db110000-0000-4000-8000-000000000003'::uuid,'Other supervisor','supervisor'),
 ('db110000-0000-4000-8000-000000000004'::uuid,'Unassigned supervisor','supervisor'),
 ('db110000-0000-4000-8000-000000000005'::uuid,'Assigned manager','contracts_manager'),
 ('db110000-0000-4000-8000-000000000006'::uuid,'Unassigned manager','contracts_manager'),
 ('db110000-0000-4000-8000-000000000007'::uuid,'Daily installer','subcontract_installer')) people(id,name,role);
insert into public.organisation_members(organisation_id,user_id,display_name,role) values
 ('db120000-0000-4000-8000-000000000002','db110000-0000-4000-8000-000000000008','Outside owner','owner');
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 ('db130000-0000-4000-8000-000000000001','db120000-0000-4000-8000-000000000001','DAILY-NEW','Fictional daily site','db110000-0000-4000-8000-000000000001'),
 ('db130000-0000-4000-8000-000000000002','db120000-0000-4000-8000-000000000002','DAILY-OUT','Other daily site','db110000-0000-4000-8000-000000000008');
insert into public.contract_assignments(organisation_id,contract_id,user_id)
select 'db120000-0000-4000-8000-000000000001','db130000-0000-4000-8000-000000000001',id::uuid from (values
 ('db110000-0000-4000-8000-000000000002'),('db110000-0000-4000-8000-000000000003'),('db110000-0000-4000-8000-000000000005')) a(id);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"db110000-0000-4000-8000-000000000001"}',true);
select public.create_locations('db130000-0000-4000-8000-000000000001',gen_random_uuid(),null,'[{"name":"Daily floor","children":[{"name":"Daily bathroom"},{"name":"Daily kitchen"}]}]');
select id as floor from public.work_areas where name='Daily floor' \gset
select id as bathroom from public.work_areas where name='Daily bathroom' \gset
select id as kitchen from public.work_areas where name='Daily kitchen' \gset
select public.create_work_package(:'floor',gen_random_uuid(),'{"name":"Daily package","quantity":1,"unit":"m2"}') as package \gset
select public.create_work_package(:'bathroom',gen_random_uuid(),'{"name":"Bathroom-only package","quantity":1,"unit":"m2"}') as bathroom_package \gset
select public.create_operative(gen_random_uuid(),'{"display_name":"Daily worker","engagement":"direct_employee"}') as worker \gset
select public.create_location_inspection_template(gen_random_uuid(),jsonb_build_object('contract_id','db130000-0000-4000-8000-000000000001',
 'work_area_id',:'floor','stage','installation','title','Daily workmanship','specification_reference','DAILY-SPEC','specification_revision','1','wet_area',false,
 'checklist','[{"label":"Quality of cuts","wet_only":false}]'::jsonb)) as template \gset
select public.create_location_inspection_template(gen_random_uuid(),jsonb_build_object('contract_id','db130000-0000-4000-8000-000000000001',
 'work_area_id',:'floor','stage','grouting','title','Daily grout','specification_reference','DAILY-SPEC','specification_revision','1','wet_area',false,
 'checklist','[{"label":"Grout joints","wet_only":false}]'::jsonb)) as grout_template \gset
select test.assert((select count(*)=2 and bool_and(display_name in ('Dave daily','Other supervisor')) from public.site_supervisor_recipients('db130000-0000-4000-8000-000000000001')),
 'office recipient selector includes only active currently assigned supervisors');
select jsonb_build_object('contract_id','db130000-0000-4000-8000-000000000001','kind','instruction','title','Materials arriving at ten',
 'body','Adhesive delivery arriving at ten; tell the gang.','recipient_id','db110000-0000-4000-8000-000000000002','acknowledgement_required',true) as message_data \gset
select gen_random_uuid() as message_key \gset
select public.create_supervisor_office_item(:'message_key',:'message_data') as message \gset
select test.assert(public.create_supervisor_office_item(:'message_key',:'message_data')=:'message', 'office message safe retry returns the exact persisted record');
select test.assert((select request_key=:'message_key' and created_by=auth.uid() and recipient_name='Dave daily' and title='Materials arriving at ten'
 from public.supervisor_office_items where id=:'message'), 'office message saves actor, request receipt and targeted instruction');
select test.expect_error(format('select public.create_supervisor_office_item(%L,%L::jsonb||''{"body":"Different instruction"}'')',:'message_key',:'message_data'),array['22023'],
 'a changed message cannot reuse the successful request key');
select public.create_supervisor_office_item(gen_random_uuid(),:'message_data'::jsonb||'{"recipient_id":null,"title":"Site-wide instruction"}') as site_message \gset
select public.create_supervisor_office_item(gen_random_uuid(),:'message_data'::jsonb||'{"recipient_id":"db110000-0000-4000-8000-000000000003","title":"Other supervisor only"}') as other_message \gset
select test.expect_error(format('select public.create_supervisor_office_item(gen_random_uuid(),%L::jsonb||''{"recipient_id":"db110000-0000-4000-8000-000000000004"}'')',:'message_data'),array['22023'],
 'unassigned supervisor cannot be selected as a message recipient');
select test.expect_error(format('select public.create_supervisor_office_item(gen_random_uuid(),%L::jsonb||''{"recipient_id":"db110000-0000-4000-8000-000000000007"}'')',:'message_data'),array['22023'],
 'installer cannot be selected as a supervisor recipient');
select jsonb_build_object('contract_id','db130000-0000-4000-8000-000000000001','kind','qa_request','title','Bathroom inspection requested',
 'body','Please inspect the bathroom before lunch.','recipient_id','db110000-0000-4000-8000-000000000002','work_area_id',:'bathroom','stage','installation') as qa_data \gset
select public.create_supervisor_office_item(gen_random_uuid(),:'qa_data') as qa \gset
select public.create_supervisor_office_item(gen_random_uuid(),:'qa_data'::jsonb||jsonb_build_object('title','Package inspection requested','work_package_id',:'package')) as package_qa \gset
select test.expect_error(format('select public.create_supervisor_office_item(gen_random_uuid(),%L::jsonb||''{"recipient_id":null}'')',:'qa_data'),array['22023'],
 'inspection requests need a real named supervisor');
select test.expect_error(format('select public.create_supervisor_office_item(gen_random_uuid(),%L::jsonb||jsonb_build_object(''work_area_id'',%L,''work_package_id'',%L))',:'qa_data',:'floor',:'bathroom_package'),array['22023'],
 'a child-only work package cannot create an impossible whole-floor inspection request');
select test.assert((select location_path=array['Daily floor','Daily bathroom'] and stage='installation' from public.supervisor_office_items where id=:'qa'),
 'QA request retains exact location context and work stage');

select set_config('request.jwt.claims','{"sub":"db110000-0000-4000-8000-000000000002"}',true);
select test.assert((select count(*)=4 from public.supervisor_office_items), 'Dave sees site instructions and his own requests, never the other supervisor private message');
select test.expect_error('select public.site_supervisor_recipients(''db130000-0000-4000-8000-000000000001'')',array['42501'], 'supervisor cannot enumerate recipient roster');
select test.expect_error(format('select public.create_supervisor_office_item(gen_random_uuid(),%L)',:'message_data'),array['42501'], 'supervisor cannot invent an office instruction or sign-off task');
select gen_random_uuid() as ack_key \gset
select public.acknowledge_supervisor_office_item(:'message',:'ack_key') as ack \gset
select test.assert(public.acknowledge_supervisor_office_item(:'message',:'ack_key')=:'ack' and
 (select count(*)=1 and bool_and(request_key=:'ack_key' and actor_id=auth.uid()) from public.supervisor_office_acknowledgements where item_id=:'message'),
 'acknowledgement retry keeps one permanent actor-bound receipt');
select test.expect_error(format('select public.acknowledge_supervisor_office_item(%L,%L)',:'site_message',:'ack_key'),array['22023'], 'acknowledgement key cannot change instruction');
select test.expect_error(format('select public.acknowledge_supervisor_office_item(%L,gen_random_uuid())',:'message'),array['23514'], 'new-key duplicate acknowledgement explicitly asks for saved state');
select test.expect_error(format('select public.acknowledge_supervisor_office_item(%L,gen_random_uuid())',:'other_message'),array['42501'], 'Dave cannot acknowledge another supervisor private instruction');
select test.expect_error(format('select public.acknowledge_supervisor_office_item(%L,gen_random_uuid())',:'qa'),array['22023'], 'acknowledgement is never QA completion');
insert into public.supervisor_inspections(organisation_id,contract_id,request_key,answers,issues_count)
 select 'db120000-0000-4000-8000-000000000001','db130000-0000-4000-8000-000000000001',gen_random_uuid(),
 jsonb_agg(jsonb_build_object('item','Practical check '||n,'status','pass','note','')),0 from generate_series(1,11) n;
insert into public.supervisor_inspections(organisation_id,contract_id,request_key,answers,issues_count)
 select 'db120000-0000-4000-8000-000000000001','db130000-0000-4000-8000-000000000001',gen_random_uuid(),
 jsonb_agg(jsonb_build_object('item','Historic check '||n,'status','pass','note','')),0 from generate_series(1,10) n;
select test.assert((select array_agg(jsonb_array_length(answers) order by jsonb_array_length(answers))=array[10,11] from public.supervisor_inspections
 where contract_id='db130000-0000-4000-8000-000000000001'), 'practical eleven-question morning records and historic ten-question records coexist unchanged');

select jsonb_build_object('contract_id','db130000-0000-4000-8000-000000000001','work_area_id',:'bathroom','template_id',:'template',
 'allocation_ids','[]'::jsonb,'answers','[{"status":"issue","note":"Quality of cut requires investigation"}]'::jsonb) as inspection_data \gset
select public.record_location_inspection(gen_random_uuid(),:'inspection_data') as inspection \gset
select public.record_location_inspection(gen_random_uuid(),:'inspection_data'::jsonb||jsonb_build_object('work_area_id',:'kitchen')) as wrong_area \gset
select public.record_location_inspection(gen_random_uuid(),:'inspection_data'::jsonb||jsonb_build_object('template_id',:'grout_template')) as wrong_stage \gset
select test.expect_error(format('select public.submit_supervisor_qa_result(%L,%L,gen_random_uuid())',:'qa',:'wrong_area'),array['22023'], 'another location inspection cannot complete the request');
select test.expect_error(format('select public.submit_supervisor_qa_result(%L,%L,gen_random_uuid())',:'qa',:'wrong_stage'),array['22023'], 'another work stage inspection cannot complete the request');
select test.expect_error(format('select public.submit_supervisor_qa_result(%L,%L,gen_random_uuid())',:'package_qa',:'inspection'),array['22023'], 'whole-location inspection cannot impersonate the requested exact work package');
select set_config('request.jwt.claims','{"sub":"db110000-0000-4000-8000-000000000003"}',true);
select public.record_location_inspection(gen_random_uuid(),:'inspection_data') as other_inspection \gset
select test.expect_error(format('select public.submit_supervisor_qa_result(%L,%L,gen_random_uuid())',:'qa',:'other_inspection'),array['42501'], 'other supervisor cannot complete a task assigned to Dave');
select set_config('request.jwt.claims','{"sub":"db110000-0000-4000-8000-000000000002"}',true);
select test.expect_error(format('select public.submit_supervisor_qa_result(%L,%L,gen_random_uuid())',:'qa',:'other_inspection'),array['22023'], 'Dave cannot submit another author inspection as his result');
reset role;
insert into public.location_inspections(organisation_id,contract_id,work_area_id,template_id,location_path,answers,issues_count,actor_id,actor_name,created_at)
 values('db120000-0000-4000-8000-000000000001','db130000-0000-4000-8000-000000000001',:'bathroom',:'template',array['Daily floor','Daily bathroom'],
 '[{"item":"Quality of cuts","status":"pass","note":""}]',0,'db110000-0000-4000-8000-000000000002','Dave daily',now()-interval '1 day') returning id as old_inspection \gset
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"db110000-0000-4000-8000-000000000002"}',true);
select test.expect_error(format('select public.submit_supervisor_qa_result(%L,%L,gen_random_uuid())',:'qa',:'old_inspection'),array['22023'], 'an old saved inspection cannot impersonate a new requested inspection');
select gen_random_uuid() as submit_key \gset
select public.submit_supervisor_qa_result(:'qa',:'inspection',:'submit_key') as submission \gset
select test.assert(public.submit_supervisor_qa_result(:'qa',:'inspection',:'submit_key')=:'submission' and
 (select has_issues and inspection_id=:'inspection' and submitted_by=auth.uid() and request_key=:'submit_key' from public.supervisor_qa_submissions where id=:'submission'),
 'honest issue completes the assigned inspection task with a confirmed linked saved result, never work release');
select test.expect_error(format('select public.submit_supervisor_qa_result(%L,%L,%L)',:'qa',:'wrong_area',:'submit_key'),array['22023'], 'QA retry cannot silently swap its linked result');
select test.expect_error(format('select public.submit_supervisor_qa_result(%L,%L,gen_random_uuid())',:'qa',:'inspection'),array['23514'], 'second-device new-key QA submission returns explicit already-recorded result');
select test.assert((public.work_release_status('db130000-0000-4000-8000-000000000001',:'bathroom','installation',null)->>'authorised')::boolean=false,
 'submitting a QA request result never authorises work release');

-- Existing actual workforce records are ended, never recreated by a handover.
select date_trunc('minute',now()-interval '10 minutes') as start_at \gset
-- Keep this valid even when the database suite runs in the first ten minutes of
-- the London day: that fixture simply starts a minute after today's midnight.
select greatest(:'start_at'::timestamptz,private.site_today()::timestamp at time zone 'Europe/London') as start_at \gset
select public.record_actual_allocation(gen_random_uuid(),jsonb_build_object('contract_id','db130000-0000-4000-8000-000000000001',
 'work_area_id',:'bathroom','stage','installation','operative_ids',jsonb_build_array(:'worker'),'started_at',to_char(:'start_at'::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
 'reason','Extra work confirmed for daily handover')) as actual \gset
select gen_random_uuid() as handover_key \gset
select jsonb_build_object('contract_id','db130000-0000-4000-8000-000000000001','finished_at',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'work_completed','Bathroom walls tiled','outstanding_problems','One cut needs attention','materials_needed','Adhesive for tomorrow',
 'areas_awaiting_attention','Daily kitchen','office_notes','Access agreed with site manager','finish_workforce',true) as handover_data \gset
select public.record_site_handover(:'handover_key',:'handover_data') as handover \gset
select test.assert((select work_date=private.site_today() and request_key=:'handover_key' and ended_count=1 and actual_allocation_ids=array[:'actual'::uuid]
 and materials_needed='Adhesive for tomorrow' and actor_id=auth.uid() from public.site_handovers where id=:'handover'),
 'handover is permanent, uses London work date and references the genuine finished actual workforce period');
select test.assert((select count(*)=1 from public.actual_allocations where contract_id='db130000-0000-4000-8000-000000000001') and
 (select count(*)=1 from public.actual_allocation_operatives where actual_allocation_id=:'actual') and
 (select ended_at is not null from public.actual_allocations where id=:'actual'), 'end-of-day handover closes existing work without duplicate attendance');
select test.assert(public.record_site_handover(:'handover_key',:'handover_data')=:'handover' and (select count(*)=1 from public.site_handovers),
 'handover safe retry returns its exact receipt and does not create or finish work twice');
select test.expect_error(format('select public.record_site_handover(%L,%L::jsonb||''{"materials_needed":"Different materials"}'')',:'handover_key',:'handover_data'),array['22023'],
 'handover retry cannot silently replace the saved office notes');
select test.expect_error('select public.record_site_handover(gen_random_uuid(),''{"contract_id":"db130000-0000-4000-8000-000000000001","finish_workforce":false}'')',array['22023'], 'empty handover cannot appear completed');
select test.expect_error(format('select public.record_site_handover(gen_random_uuid(),%L::jsonb||''{"finished_at":"2099-01-01T17:00:00Z"}'')',:'handover_data'),array['22023'], 'future handover cannot finish workforce records');
select test.expect_error(format('update public.site_handovers set work_completed=''Rewritten'' where id=%L',:'handover'),array['42501'], 'signed-in clients cannot rewrite a saved handover');
select test.expect_error(format('delete from public.supervisor_office_items where id=%L',:'message'),array['42501'], 'signed-in clients cannot delete office history');

select set_config('request.jwt.claims','{"sub":"db110000-0000-4000-8000-000000000005"}',true);
select test.assert((select count(*)=5 from public.supervisor_office_items) and (select count(*)=1 from public.supervisor_qa_submissions)
 and (select count(*)=1 from public.site_handovers), 'assigned office manager sees targeted messages, submitted issues and permanent handover');
select set_config('request.jwt.claims','{"sub":"db110000-0000-4000-8000-000000000006"}',true);
select test.assert((select count(*)=0 from public.supervisor_office_items) and (select count(*)=0 from public.site_handovers), 'unassigned manager has no daily workflow records');
select test.expect_error(format('select public.create_supervisor_office_item(gen_random_uuid(),%L)',:'message_data'),array['42501'], 'unassigned manager cannot send site instructions');
select set_config('request.jwt.claims','{"sub":"db110000-0000-4000-8000-000000000007"}',true);
select test.assert((select count(*)=0 from public.supervisor_office_items) and (select count(*)=0 from public.site_handovers), 'installer cannot read office instructions or handovers');
select test.expect_error(format('select public.record_site_handover(gen_random_uuid(),%L)',:'handover_data'),array['42501'], 'installer cannot finish a supervisor day');
select set_config('request.jwt.claims','{"sub":"db110000-0000-4000-8000-000000000008"}',true);
select test.assert((select count(*)=0 from public.supervisor_office_items) and (select count(*)=0 from public.supervisor_qa_submissions), 'other organisation owner cannot read daily records');
select test.expect_error(format('select public.create_supervisor_office_item(gen_random_uuid(),%L)',:'message_data'),array['42501'], 'other organisation owner cannot send instructions to this site');

-- Removing an assignment immediately removes current read and retry authority.
reset role;
delete from public.contract_assignments where contract_id='db130000-0000-4000-8000-000000000001' and user_id='db110000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"db110000-0000-4000-8000-000000000002"}',true);
select test.assert((select count(*)=0 from public.supervisor_office_items) and (select count(*)=0 from public.supervisor_office_acknowledgements)
 and (select count(*)=0 from public.supervisor_qa_submissions) and (select count(*)=0 from public.site_handovers), 'revoked site assignment removes all current daily record visibility');
select test.expect_error(format('select public.acknowledge_supervisor_office_item(%L,%L)',:'message',:'ack_key'),array['42501'], 'an old successful acknowledgement key cannot bypass revoked assignment');
select test.expect_error(format('select public.submit_supervisor_qa_result(%L,%L,%L)',:'qa',:'inspection',:'submit_key'),array['42501'], 'an old successful QA key cannot bypass revoked assignment');
select test.expect_error(format('select public.record_site_handover(%L,%L)',:'handover_key',:'handover_data'),array['42501'], 'an old successful handover key cannot bypass revoked assignment');
reset role;
select test.expect_error(format('update public.supervisor_office_items set body=''Changed'' where id=%L',:'message'),array['42501'], 'append-only trigger protects original office instruction even beyond client grants');
select test.expect_error(format('delete from public.site_handovers where id=%L',:'handover'),array['42501'], 'append-only trigger protects permanent handovers');
select test.assert((select count(*)=1 from public.supervisor_office_acknowledgements) and (select count(*)=1 from public.supervisor_qa_submissions), 'assignment revocation preserves historic acknowledgements and QA submissions');
rollback;
