-- Messages and replies between the office and the supervisor in the conversation.
-- Disposable database only.
begin;
insert into auth.users(id,email) values
 ('db510000-0000-4000-8000-000000000001','messages-owner@example.invalid'),
 ('db510000-0000-4000-8000-000000000002','messages-dave@example.invalid'),
 ('db510000-0000-4000-8000-000000000003','messages-other-supervisor@example.invalid'),
 ('db510000-0000-4000-8000-000000000004','messages-manager@example.invalid'),
 ('db510000-0000-4000-8000-000000000005','messages-unassigned-manager@example.invalid'),
 ('db510000-0000-4000-8000-000000000006','messages-installer@example.invalid'),
 ('db510000-0000-4000-8000-000000000007','messages-outsider@example.invalid');
insert into public.organisations(id,name) values
 ('db520000-0000-4000-8000-000000000001','Job messages test'),
 ('db520000-0000-4000-8000-000000000002','Other job messages test');
insert into public.organisation_members(organisation_id,user_id,display_name,role)
select 'db520000-0000-4000-8000-000000000001',id,name,role::public.operations_role from (values
 ('db510000-0000-4000-8000-000000000001'::uuid,'Messages owner','owner'),
 ('db510000-0000-4000-8000-000000000002'::uuid,'Dave messages','supervisor'),
 ('db510000-0000-4000-8000-000000000003'::uuid,'Other messages supervisor','supervisor'),
 ('db510000-0000-4000-8000-000000000004'::uuid,'Messages manager','contracts_manager'),
 ('db510000-0000-4000-8000-000000000005'::uuid,'Unassigned messages manager','contracts_manager'),
 ('db510000-0000-4000-8000-000000000006'::uuid,'Messages installer','subcontract_installer')) people(id,name,role);
insert into public.organisation_members(organisation_id,user_id,display_name,role) values
 ('db520000-0000-4000-8000-000000000002','db510000-0000-4000-8000-000000000007','Outside messages owner','owner');
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 ('db530000-0000-4000-8000-000000000001','db520000-0000-4000-8000-000000000001','MSG-1','Fictional messages site','db510000-0000-4000-8000-000000000001'),
 ('db530000-0000-4000-8000-000000000002','db520000-0000-4000-8000-000000000001','MSG-2','Second messages site','db510000-0000-4000-8000-000000000001');
insert into public.contract_assignments(organisation_id,contract_id,user_id)
select 'db520000-0000-4000-8000-000000000001',c::uuid,u::uuid from (values
 ('db530000-0000-4000-8000-000000000001','db510000-0000-4000-8000-000000000002'),('db530000-0000-4000-8000-000000000001','db510000-0000-4000-8000-000000000003'),
 ('db530000-0000-4000-8000-000000000001','db510000-0000-4000-8000-000000000004'),('db530000-0000-4000-8000-000000000002','db510000-0000-4000-8000-000000000002')) a(c,u);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"db510000-0000-4000-8000-000000000001"}',true);
select public.create_locations('db530000-0000-4000-8000-000000000001',gen_random_uuid(),null,'[{"name":"Messages kitchen"}]');
select id as kitchen from public.work_areas where name='Messages kitchen' \gset
select public.create_location_inspection_template(gen_random_uuid(),jsonb_build_object('contract_id','db530000-0000-4000-8000-000000000001',
 'work_area_id',:'kitchen','stage','installation','title','Messages workmanship','specification_reference','MSG-SPEC','specification_revision','1','wet_area',false,
 'checklist','[{"label":"Quality of cuts","wet_only":false}]'::jsonb)) as template \gset
select public.create_supervisor_office_item(gen_random_uuid(),jsonb_build_object('contract_id','db530000-0000-4000-8000-000000000001','kind','instruction',
 'title','Dave only','body','For Dave.','recipient_id','db510000-0000-4000-8000-000000000002','acknowledgement_required',true)) as dave_item \gset
select public.create_supervisor_office_item(gen_random_uuid(),jsonb_build_object('contract_id','db530000-0000-4000-8000-000000000001','kind','instruction',
 'title','Other only','body','For the other supervisor.','recipient_id','db510000-0000-4000-8000-000000000003','acknowledgement_required',true)) as other_item \gset
select public.create_supervisor_office_item(gen_random_uuid(),jsonb_build_object('contract_id','db530000-0000-4000-8000-000000000002','kind','instruction',
 'title','Second site','body','For Dave on the second site.','recipient_id','db510000-0000-4000-8000-000000000002','acknowledgement_required',false)) as second_site_item \gset
select public.create_supervisor_office_item(gen_random_uuid(),jsonb_build_object('contract_id','db530000-0000-4000-8000-000000000001','kind','qa_request',
 'title','Kitchen ready?','body','Inspect the kitchen.','recipient_id','db510000-0000-4000-8000-000000000002','work_area_id',:'kitchen','stage','installation')) as qa \gset
select public.create_work_hold(gen_random_uuid(),jsonb_build_object('contract_id','db530000-0000-4000-8000-000000000001',
 'work_area_id',:'kitchen','stage','installation','activity','Kitchen wall tiling','hold_type','quality','category','Workmanship','severity','major',
 'reason','Lippage beyond tolerance across the splashback','required_action','Reset the affected tiles before grouting',
 'evidence_explanation','Concern documented on the walk round')) as hold \gset

select set_config('request.jwt.claims','{"sub":"db510000-0000-4000-8000-000000000002"}',true);
select public.record_location_inspection(gen_random_uuid(),jsonb_build_object('contract_id','db530000-0000-4000-8000-000000000001','work_area_id',:'kitchen',
 'template_id',:'template','allocation_ids','[]'::jsonb,'answers','[{"status":"issue","note":"Two cuts to replace"}]'::jsonb)) as inspection \gset
select public.submit_supervisor_qa_result(:'qa',:'inspection',gen_random_uuid()) as result \gset
select public.record_site_handover(gen_random_uuid(),jsonb_build_object('contract_id','db530000-0000-4000-8000-000000000001',
 'work_completed','Kitchen walls tiled','office_notes','Possible daywork','finish_workforce',false)) as handover \gset

-- Dave starts conversations: about the job, and about records he can see.
select gen_random_uuid() as ask_key \gset
select jsonb_build_object('contract_id','db530000-0000-4000-8000-000000000001','body','Can we start the bathroom floor before the screed fix?','needs_answer',true) as ask_data \gset
select public.post_job_message(:'ask_key',:'ask_data') as ask \gset
select test.assert(public.post_job_message(:'ask_key',:'ask_data')=:'ask'
 and (select thread_id=id and about_type='job' and about_id is null and author_side='site' and site_user_id=auth.uid() and needs_answer and author_name='Dave messages'
  from public.job_messages where id=:'ask'),
 'a supervisor starts a conversation about the job, and its safe retry returns the same message');
select test.expect_error(format('select public.post_job_message(%L,%L::jsonb||''{"body":"A different question"}'')',:'ask_key',:'ask_data'),array['22023'],
 'a message key cannot be reused with different words');
select public.post_job_message(gen_random_uuid(),jsonb_build_object('contract_id','db530000-0000-4000-8000-000000000001','about_type','office_item','about_id',:'dave_item',
 'body','Which gang does this apply to?')) as about_item \gset
select public.post_job_message(gen_random_uuid(),jsonb_build_object('contract_id','db530000-0000-4000-8000-000000000001','about_type','hold','about_id',:'hold',
 'body','Is the gang allowed to start the adjoining wall?','needs_answer',true)) as about_hold \gset
select public.post_job_message(gen_random_uuid(),jsonb_build_object('contract_id','db530000-0000-4000-8000-000000000001','about_type','qa_result','about_id',:'result',
 'body','Photos of the two cuts are on the snag.')) as about_result \gset
select public.post_job_message(gen_random_uuid(),jsonb_build_object('contract_id','db530000-0000-4000-8000-000000000001','about_type','handover','about_id',:'handover',
 'body','Bin store daywork: main contractor wants an answer today.','needs_answer',true)) as about_handover \gset
select test.assert((select count(*)=5 and bool_and(thread_id=id and author_side='site') from public.job_messages),
 'each conversation records what it is about');
select test.expect_error(format('select public.post_job_message(gen_random_uuid(),jsonb_build_object(''contract_id'',''db530000-0000-4000-8000-000000000001'',''about_type'',''office_item'',''about_id'',%L,''body'',''Peek''))',:'other_item'),array['22023'],
 'a supervisor cannot start a conversation about another supervisor''s private instruction');
select test.expect_error(format('select public.post_job_message(gen_random_uuid(),jsonb_build_object(''contract_id'',''db530000-0000-4000-8000-000000000001'',''about_type'',''office_item'',''about_id'',%L,''body'',''Wrong job''))',:'second_site_item'),array['22023'],
 'a conversation is about a record on the same job');
select test.expect_error('select public.post_job_message(gen_random_uuid(),jsonb_build_object(''contract_id'',''db530000-0000-4000-8000-000000000001'',''about_type'',''snag'',''about_id'',gen_random_uuid(),''body'',''No such snag''))',array['22023'],
 'an unknown snag is refused');
select test.expect_error(format('select public.post_job_message(gen_random_uuid(),jsonb_build_object(''contract_id'',''db530000-0000-4000-8000-000000000001'',''about_type'',''job'',''about_id'',%L,''body'',''Mixed''))',:'hold'),array['22023'],
 'a message about the whole job names no record');
select test.expect_error('select public.post_job_message(gen_random_uuid(),jsonb_build_object(''contract_id'',''db530000-0000-4000-8000-000000000001'',''about_type'',''invoice'',''body'',''Money''))',array['22023'],
 'only the listed kinds of record can be discussed');
select test.expect_error('select public.post_job_message(gen_random_uuid(),jsonb_build_object(''contract_id'',''db530000-0000-4000-8000-000000000001'',''body'',''   ''))',array['22023'],
 'an empty message is refused');

-- The office replies; it starts with an instruction, not a conversation.
select set_config('request.jwt.claims','{"sub":"db510000-0000-4000-8000-000000000004"}',true);
select test.expect_error('select public.post_job_message(gen_random_uuid(),jsonb_build_object(''contract_id'',''db530000-0000-4000-8000-000000000001'',''body'',''Office starting a thread''))',array['42501'],
 'the office cannot start a conversation; it sends an instruction');
select test.assert((select count(*)=5 from public.job_messages), 'the assigned office manager sees every conversation on the job');
select public.post_job_message(gen_random_uuid(),jsonb_build_object('contract_id','db530000-0000-4000-8000-000000000001','thread_id',:'ask',
 'body','Yes, start the bathroom floor at 7:30. Kitchen grout after lunch.')) as reply \gset
select test.assert((select thread_id=:'ask' and about_type is null and author_side='office' and site_user_id='db510000-0000-4000-8000-000000000002' and author_name='Messages manager'
 from public.job_messages where id=:'reply'), 'an office reply joins the conversation with the supervisor it belongs to');
select test.expect_error(format('select public.post_job_message(gen_random_uuid(),jsonb_build_object(''contract_id'',''db530000-0000-4000-8000-000000000001'',''thread_id'',%L,''body'',''Reply to a reply''))',:'reply'),array['42501'],
 'a reply names the conversation, not another reply');
select test.expect_error(format('select public.post_job_message(gen_random_uuid(),jsonb_build_object(''contract_id'',''db530000-0000-4000-8000-000000000002'',''thread_id'',%L,''body'',''Wrong job''))',:'ask'),array['42501'],
 'a reply stays on the conversation''s job');

select set_config('request.jwt.claims','{"sub":"db510000-0000-4000-8000-000000000001"}',true);
select public.post_job_message(gen_random_uuid(),jsonb_build_object('contract_id','db530000-0000-4000-8000-000000000001','thread_id',:'about_handover',
 'body','Do not start the bin store until we confirm with the main contractor.','needs_answer',false)) as owner_reply \gset
select test.assert((select author_side='office' from public.job_messages where id=:'owner_reply'), 'the owner replies as the office');

-- Only Dave and the office are in Dave's conversations.
select set_config('request.jwt.claims','{"sub":"db510000-0000-4000-8000-000000000003"}',true);
select test.assert((select count(*)=0 from public.job_messages), 'another supervisor on the same site sees none of Dave''s conversations');
select test.expect_error(format('select public.post_job_message(gen_random_uuid(),jsonb_build_object(''contract_id'',''db530000-0000-4000-8000-000000000001'',''thread_id'',%L,''body'',''Butting in''))',:'ask'),array['42501'],
 'another supervisor cannot reply in Dave''s conversation');
select public.post_job_message(gen_random_uuid(),jsonb_build_object('contract_id','db530000-0000-4000-8000-000000000001','body','Other supervisor question')) as other_ask \gset
select test.assert((select count(*)=1 from public.job_messages), 'another supervisor sees only their own conversation');
select set_config('request.jwt.claims','{"sub":"db510000-0000-4000-8000-000000000005"}',true);
select test.assert((select count(*)=0 from public.job_messages), 'an unassigned manager sees no conversations');
select test.expect_error(format('select public.post_job_message(gen_random_uuid(),jsonb_build_object(''contract_id'',''db530000-0000-4000-8000-000000000001'',''thread_id'',%L,''body'',''Not my job''))',:'ask'),array['42501'],
 'an unassigned manager cannot reply');
select set_config('request.jwt.claims','{"sub":"db510000-0000-4000-8000-000000000006"}',true);
select test.assert((select count(*)=0 from public.job_messages), 'an installer sees no conversations');
select test.expect_error('select public.post_job_message(gen_random_uuid(),jsonb_build_object(''contract_id'',''db530000-0000-4000-8000-000000000001'',''body'',''Installer question''))',array['42501'],
 'an installer cannot start a conversation');
select set_config('request.jwt.claims','{"sub":"db510000-0000-4000-8000-000000000007"}',true);
select test.assert((select count(*)=0 from public.job_messages), 'another organisation sees no conversations');
select test.expect_error(format('select public.post_job_message(gen_random_uuid(),jsonb_build_object(''contract_id'',''db530000-0000-4000-8000-000000000001'',''thread_id'',%L,''body'',''Outsider''))',:'ask'),array['42501'],
 'another organisation cannot reply');

-- "Got it": the other side records that it has read a message.
select set_config('request.jwt.claims','{"sub":"db510000-0000-4000-8000-000000000002"}',true);
select public.post_job_message(gen_random_uuid(),jsonb_build_object('contract_id','db530000-0000-4000-8000-000000000001','thread_id',:'ask','body','Thanks, will do.')) as thanks \gset
select gen_random_uuid() as read_key \gset
select public.mark_job_message_read(:'reply',:'read_key') as receipt \gset
select test.assert(public.mark_job_message_read(:'reply',:'read_key')=:'receipt'
 and (select reader_id=auth.uid() and message_id=:'reply' and request_key=:'read_key' from public.job_message_reads where id=:'receipt'),
 'the supervisor records reading the office reply, and the safe retry returns the same receipt');
select test.expect_error(format('select public.mark_job_message_read(%L,gen_random_uuid())',:'reply'),array['23514'], 'a message is marked read once per person');
select test.expect_error(format('select public.mark_job_message_read(%L,gen_random_uuid())',:'thanks'),array['42501'], 'nobody marks their own side''s message as read');
select set_config('request.jwt.claims','{"sub":"db510000-0000-4000-8000-000000000004"}',true);
select public.mark_job_message_read(:'thanks',gen_random_uuid()) as office_receipt \gset
select test.expect_error(format('select public.mark_job_message_read(%L,gen_random_uuid())',:'reply'),array['42501'], 'the office does not mark its own reply as read');
select set_config('request.jwt.claims','{"sub":"db510000-0000-4000-8000-000000000003"}',true);
select test.expect_error(format('select public.mark_job_message_read(%L,gen_random_uuid())',:'reply'),array['42501'], 'another supervisor cannot mark Dave''s messages as read');
select test.assert((select count(*)=0 from public.job_message_reads), 'another supervisor sees no read receipts for Dave''s conversation');
select set_config('request.jwt.claims','{"sub":"db510000-0000-4000-8000-000000000002"}',true);
select test.assert((select count(*)=2 from public.job_message_reads), 'Dave sees both receipts in his conversation');
select test.expect_error(format('update public.job_messages set body=''Rewritten'' where id=%L',:'ask'),array['42501'], 'signed-in clients cannot rewrite a message');
select test.expect_error(format('delete from public.job_message_reads where id=%L',:'receipt'),array['42501'], 'signed-in clients cannot delete a read receipt');

reset role;
select test.assert((select count(*)=9 from public.audit_events where entity_type='job_messages')
 and (select count(*)=2 from public.audit_events where entity_type='job_message_reads'), 'every message and read receipt has an audit event');
select test.expect_error(format('update public.job_messages set body=''Rewritten'' where id=%L',:'ask'),array['42501'], 'append-only trigger protects a message even beyond client grants');
select test.expect_error(format('delete from public.job_messages where id=%L',:'reply'),array['42501'], 'append-only trigger protects a reply even beyond client grants');
delete from public.contract_assignments where contract_id='db530000-0000-4000-8000-000000000001' and user_id='db510000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"db510000-0000-4000-8000-000000000002"}',true);
select test.assert((select count(*)=0 from public.job_messages) and (select count(*)=0 from public.job_message_reads),
 'a revoked site assignment removes the supervisor''s view of the conversations');
select test.expect_error(format('select public.post_job_message(%L,%L)',:'ask_key',:'ask_data'),array['42501'], 'an old message key cannot bypass a revoked assignment');
rollback;
