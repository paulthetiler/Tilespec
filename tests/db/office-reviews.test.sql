-- Office reviews of inspection results and handovers, and instructions the office
-- changes, marks urgent or withdraws. Disposable database only.
begin;
insert into auth.users(id,email) values
 ('db310000-0000-4000-8000-000000000001','review-owner@example.invalid'),
 ('db310000-0000-4000-8000-000000000002','review-dave@example.invalid'),
 ('db310000-0000-4000-8000-000000000003','review-other-supervisor@example.invalid'),
 ('db310000-0000-4000-8000-000000000004','review-manager@example.invalid'),
 ('db310000-0000-4000-8000-000000000005','review-unassigned-manager@example.invalid'),
 ('db310000-0000-4000-8000-000000000006','review-installer@example.invalid'),
 ('db310000-0000-4000-8000-000000000007','review-outsider@example.invalid');
insert into public.organisations(id,name) values
 ('db320000-0000-4000-8000-000000000001','Office review test'),
 ('db320000-0000-4000-8000-000000000002','Other office review test');
insert into public.organisation_members(organisation_id,user_id,display_name,role)
select 'db320000-0000-4000-8000-000000000001',id,name,role::public.operations_role from (values
 ('db310000-0000-4000-8000-000000000001'::uuid,'Review owner','owner'),
 ('db310000-0000-4000-8000-000000000002'::uuid,'Dave review','supervisor'),
 ('db310000-0000-4000-8000-000000000003'::uuid,'Other review supervisor','supervisor'),
 ('db310000-0000-4000-8000-000000000004'::uuid,'Review manager','contracts_manager'),
 ('db310000-0000-4000-8000-000000000005'::uuid,'Unassigned review manager','contracts_manager'),
 ('db310000-0000-4000-8000-000000000006'::uuid,'Review installer','subcontract_installer')) people(id,name,role);
insert into public.organisation_members(organisation_id,user_id,display_name,role) values
 ('db320000-0000-4000-8000-000000000002','db310000-0000-4000-8000-000000000007','Outside review owner','owner');
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 ('db330000-0000-4000-8000-000000000001','db320000-0000-4000-8000-000000000001','REVIEW-1','Fictional review site','db310000-0000-4000-8000-000000000001'),
 ('db330000-0000-4000-8000-000000000002','db320000-0000-4000-8000-000000000001','REVIEW-2','Second review site','db310000-0000-4000-8000-000000000001'),
 ('db330000-0000-4000-8000-000000000003','db320000-0000-4000-8000-000000000002','REVIEW-OUT','Other organisation site','db310000-0000-4000-8000-000000000007');
insert into public.contract_assignments(organisation_id,contract_id,user_id)
select 'db320000-0000-4000-8000-000000000001',c::uuid,u::uuid from (values
 ('db330000-0000-4000-8000-000000000001','db310000-0000-4000-8000-000000000002'),('db330000-0000-4000-8000-000000000001','db310000-0000-4000-8000-000000000003'),
 ('db330000-0000-4000-8000-000000000001','db310000-0000-4000-8000-000000000004'),('db330000-0000-4000-8000-000000000002','db310000-0000-4000-8000-000000000002')) a(c,u);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000001"}',true);
select public.create_locations('db330000-0000-4000-8000-000000000001',gen_random_uuid(),null,'[{"name":"Review kitchen"}]');
select id as kitchen from public.work_areas where name='Review kitchen' \gset
select public.create_location_inspection_template(gen_random_uuid(),jsonb_build_object('contract_id','db330000-0000-4000-8000-000000000001',
 'work_area_id',:'kitchen','stage','installation','title','Review workmanship','specification_reference','REVIEW-SPEC','specification_revision','1','wet_area',false,
 'checklist','[{"label":"Quality of cuts","wet_only":false}]'::jsonb)) as template \gset

-- M2: urgent, changed and withdrawn instructions.
select jsonb_build_object('contract_id','db330000-0000-4000-8000-000000000001','kind','instruction','title','Kitchen grout first',
 'body','Grout the kitchen first thing tomorrow.','recipient_id','db310000-0000-4000-8000-000000000002','acknowledgement_required',true) as first_data \gset
select public.create_supervisor_office_item(gen_random_uuid(),:'first_data') as first \gset
select test.assert((select not urgent and replaces_id is null from public.supervisor_office_items where id=:'first'),
 'an instruction sent without the new fields is saved as before: not urgent and replacing nothing');
select test.expect_error(format('select public.create_supervisor_office_item(gen_random_uuid(),%L::jsonb||''{"urgent":"yes"}'')',:'first_data'),array['22023'],
 'urgent must be true or false');
select jsonb_build_object('contract_id','db330000-0000-4000-8000-000000000001','kind','qa_request','title','Kitchen ready for grout?',
 'body','Please inspect the kitchen.','recipient_id','db310000-0000-4000-8000-000000000002','work_area_id',:'kitchen','stage','installation') as qa_data \gset
select test.expect_error(format('select public.create_supervisor_office_item(gen_random_uuid(),%L::jsonb||''{"urgent":true}'')',:'qa_data'),array['22023'],
 'only an instruction can be marked urgent');
select gen_random_uuid() as change_key \gset
select :'first_data'::jsonb||jsonb_build_object('title','CHANGE: bathroom floor first','body','Screed fix moved to 7:30. Tile the bathroom floor first.',
 'replaces_id',:'first','urgent',true) as change_data \gset

-- The supervisor acknowledges the first version before it is changed.
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000002"}',true);
select gen_random_uuid() as early_ack_key \gset
select public.acknowledge_supervisor_office_item(:'first',:'early_ack_key') as early_ack \gset
select test.expect_error(format('select public.create_supervisor_office_item(%L,%L)',:'change_key',:'change_data'),array['42501'],
 'a supervisor cannot change an office instruction');

select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000001"}',true);
select public.create_supervisor_office_item(:'change_key',:'change_data') as changed \gset
select test.assert(public.create_supervisor_office_item(:'change_key',:'change_data')=:'changed'
 and (select replaces_id=:'first' and urgent and recipient_id='db310000-0000-4000-8000-000000000002' and title='CHANGE: bathroom floor first'
  from public.supervisor_office_items where id=:'changed'),
 'a change is a new urgent instruction naming the one it replaces, and its safe retry returns the same record');
select test.assert((select title='Kitchen grout first' and not urgent from public.supervisor_office_items where id=:'first'),
 'the original instruction is kept exactly as sent');
select test.expect_error(format('select public.create_supervisor_office_item(gen_random_uuid(),%L)',:'change_data'),array['23514'],
 'an instruction can only be changed once; the latest version is changed next');
select test.expect_error(format('select public.create_supervisor_office_item(gen_random_uuid(),%L::jsonb||jsonb_build_object(''replaces_id'',%L,''recipient_id'',''db310000-0000-4000-8000-000000000003''))',:'change_data',:'changed'),array['22023'],
 'a changed instruction goes to the same person as the original');
select public.create_supervisor_office_item(gen_random_uuid(),:'qa_data') as qa \gset
select test.expect_error(format('select public.create_supervisor_office_item(gen_random_uuid(),%L::jsonb||jsonb_build_object(''replaces_id'',%L))',:'qa_data',:'qa'),array['22023'],
 'an inspection request cannot be changed in place');
select test.expect_error(format('select public.create_supervisor_office_item(gen_random_uuid(),%L::jsonb||jsonb_build_object(''replaces_id'',%L,''title'',''Wrong place''))',:'first_data',:'qa'),array['22023'],
 'an instruction cannot replace an inspection request');
select public.create_supervisor_office_item(gen_random_uuid(),:'first_data'::jsonb||'{"contract_id":"db330000-0000-4000-8000-000000000002","title":"Second site instruction"}') as second_site \gset
select test.expect_error(format('select public.create_supervisor_office_item(gen_random_uuid(),%L::jsonb||jsonb_build_object(''replaces_id'',%L))',:'first_data',:'second_site'),array['22023'],
 'an instruction cannot replace one from another job');

select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000002"}',true);
select test.assert(public.acknowledge_supervisor_office_item(:'first',:'early_ack_key')=:'early_ack',
 'an acknowledgement saved before the change can still be retried safely');
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000001"}',true);
select public.create_supervisor_office_item(gen_random_uuid(),:'first_data'::jsonb||'{"title":"Unread then changed"}') as unread \gset
select public.create_supervisor_office_item(gen_random_uuid(),:'first_data'::jsonb||jsonb_build_object('title','Unread, changed version','replaces_id',:'unread')) as unread_changed \gset
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000002"}',true);
select test.expect_error(format('select public.acknowledge_supervisor_office_item(%L,gen_random_uuid())',:'unread'),array['23514'],
 'a replaced instruction no longer takes a new acknowledgement');
select public.acknowledge_supervisor_office_item(:'changed',gen_random_uuid()) as changed_ack \gset
select test.assert((select count(*)=1 from public.supervisor_office_acknowledgements where item_id=:'changed' and actor_id=auth.uid()),
 'the supervisor acknowledges the latest version');

-- Withdrawal.
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000003"}',true);
select test.expect_error(format('select public.withdraw_supervisor_office_item(%L,gen_random_uuid(),''Not needed'')',:'changed'),array['42501'],
 'a supervisor cannot withdraw an office instruction');
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000005"}',true);
select test.expect_error(format('select public.withdraw_supervisor_office_item(%L,gen_random_uuid(),''Not needed'')',:'changed'),array['42501'],
 'an unassigned manager cannot withdraw it');
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000004"}',true);
select test.expect_error(format('select public.withdraw_supervisor_office_item(%L,gen_random_uuid(),''   '')',:'changed'),array['22023'],
 'a withdrawal needs a reason');
select test.expect_error(format('select public.withdraw_supervisor_office_item(%L,gen_random_uuid(),''Changed again'')',:'first'),array['23514'],
 'a replaced version cannot be withdrawn; the latest one is');
select gen_random_uuid() as withdraw_key \gset
select public.withdraw_supervisor_office_item(:'unread_changed',:'withdraw_key','Main contractor cancelled the visit') as withdrawal \gset
select test.assert(public.withdraw_supervisor_office_item(:'unread_changed',:'withdraw_key','Main contractor cancelled the visit')=:'withdrawal'
 and (select reason='Main contractor cancelled the visit' and withdrawn_by=auth.uid() and withdrawn_by_name='Review manager' and request_key=:'withdraw_key'
  from public.supervisor_office_item_withdrawals where id=:'withdrawal'),
 'a withdrawal saves who, when and why, and its safe retry returns the same record');
select test.expect_error(format('select public.withdraw_supervisor_office_item(%L,%L,''A different reason'')',:'unread_changed',:'withdraw_key'),array['22023'],
 'a withdrawal key cannot be reused with a different reason');
select test.expect_error(format('select public.withdraw_supervisor_office_item(%L,gen_random_uuid(),''Again'')',:'unread_changed'),array['23514'],
 'an instruction is withdrawn once');
select test.expect_error(format('select public.create_supervisor_office_item(gen_random_uuid(),%L::jsonb||jsonb_build_object(''replaces_id'',%L))',:'first_data',:'unread_changed'),array['23514'],
 'a withdrawn instruction cannot be changed');
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000002"}',true);
select test.expect_error(format('select public.acknowledge_supervisor_office_item(%L,gen_random_uuid())',:'unread_changed'),array['23514'],
 'a withdrawn instruction takes no acknowledgement');
select test.assert((select count(*)=1 from public.supervisor_office_item_withdrawals where item_id=:'unread_changed'),
 'the supervisor it was for can see that it was withdrawn');

-- Inspection requests: withdrawn before a result, or not at all once the result is in.
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000001"}',true);
select public.create_supervisor_office_item(gen_random_uuid(),:'qa_data'::jsonb||'{"title":"Cancelled inspection"}') as cancelled_qa \gset
select public.withdraw_supervisor_office_item(:'cancelled_qa',gen_random_uuid(),'Work not ready yet') as cancelled_withdrawal \gset
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000002"}',true);
select jsonb_build_object('contract_id','db330000-0000-4000-8000-000000000001','work_area_id',:'kitchen','template_id',:'template',
 'allocation_ids','[]'::jsonb,'answers','[{"status":"issue","note":"Two cuts need replacing"}]'::jsonb) as inspection_data \gset
select public.record_location_inspection(gen_random_uuid(),:'inspection_data') as inspection \gset
select test.expect_error(format('select public.submit_supervisor_qa_result(%L,%L,gen_random_uuid())',:'cancelled_qa',:'inspection'),array['23514'],
 'a withdrawn inspection request takes no new result');
select public.submit_supervisor_qa_result(:'qa',:'inspection',gen_random_uuid()) as result \gset
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000001"}',true);
select test.expect_error(format('select public.withdraw_supervisor_office_item(%L,gen_random_uuid(),''Too late'')',:'qa'),array['23514'],
 'a request whose result has been sent cannot be withdrawn');

-- A private instruction for Dave: the other supervisor sees neither it nor its withdrawal.
select public.create_supervisor_office_item(gen_random_uuid(),:'first_data'::jsonb||'{"title":"Dave only"}') as dave_only \gset
select public.withdraw_supervisor_office_item(:'dave_only',gen_random_uuid(),'Sent in error') as dave_only_withdrawal \gset
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000003"}',true);
select test.assert((select count(*)=0 from public.supervisor_office_item_withdrawals where item_id=:'dave_only'),
 'another supervisor cannot see the withdrawal of a message that was not for them');
select test.expect_error(format('select public.acknowledge_supervisor_office_item(%L,gen_random_uuid())',:'dave_only'),array['42501'],
 'another supervisor learns nothing about a private instruction by trying to acknowledge it');

-- M3: office reviews of the inspection result and the handover.
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000002"}',true);
select public.record_site_handover(gen_random_uuid(),jsonb_build_object('contract_id','db330000-0000-4000-8000-000000000001',
 'work_completed','Kitchen walls tiled','outstanding_problems','Two cuts need replacing','office_notes','Possible daywork: bin store wall',
 'finish_workforce',false)) as handover \gset
select test.expect_error(format('select public.record_office_review(gen_random_uuid(),jsonb_build_object(''subject'',''handover'',''subject_id'',%L,''outcome'',''noted''))',:'handover'),array['42501'],
 'a supervisor cannot review their own handover');
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000005"}',true);
select test.expect_error(format('select public.record_office_review(gen_random_uuid(),jsonb_build_object(''subject'',''qa_result'',''subject_id'',%L,''outcome'',''noted''))',:'result'),array['42501'],
 'an unassigned manager cannot review this job''s results');
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000007"}',true);
select test.expect_error(format('select public.record_office_review(gen_random_uuid(),jsonb_build_object(''subject'',''handover'',''subject_id'',%L,''outcome'',''noted''))',:'handover'),array['42501'],
 'another organisation cannot review this handover');
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000004"}',true);
select test.expect_error('select public.record_office_review(gen_random_uuid(),jsonb_build_object(''subject'',''handover'',''subject_id'',gen_random_uuid(),''outcome'',''noted''))',array['42501'],
 'an unknown subject is refused without saying whether it exists');
select test.expect_error(format('select public.record_office_review(gen_random_uuid(),jsonb_build_object(''subject'',''qa_result'',''subject_id'',%L,''outcome'',''approved''))',:'result'),array['22023'],
 'a review outcome is noted, snag raised, stop raised or instruction sent; never an approval');
select test.expect_error(format('select public.record_office_review(gen_random_uuid(),jsonb_build_object(''subject'',''qa_result'',''subject_id'',%L,''outcome'',''noted'',''follow_up_id'',%L))',:'result',:'changed'),array['22023'],
 'a noted review has no follow-up record');
select test.expect_error(format('select public.record_office_review(gen_random_uuid(),jsonb_build_object(''subject'',''qa_result'',''subject_id'',%L,''outcome'',''snag_raised'',''follow_up_id'',%L))',:'result',:'changed'),array['22023'],
 'a snag follow-up must be a snag on this job');
select test.expect_error(format('select public.record_office_review(gen_random_uuid(),jsonb_build_object(''subject'',''qa_result'',''subject_id'',%L,''outcome'',''instruction_sent'',''follow_up_id'',%L))',:'result',:'second_site'),array['22023'],
 'an instruction follow-up must be on this job');
select gen_random_uuid() as review_key \gset
select jsonb_build_object('subject','qa_result','subject_id',:'result','outcome','instruction_sent','follow_up_id',:'changed',
 'note','Gang told to replace the two cuts before grouting.') as review_data \gset
select public.record_office_review(:'review_key',:'review_data') as review \gset
select test.assert(public.record_office_review(:'review_key',:'review_data')=:'review'
 and (select qa_submission_id=:'result' and handover_id is null and outcome='instruction_sent' and follow_up_id=:'changed'
  and reviewed_by=auth.uid() and reviewed_by_name='Review manager' and contract_id='db330000-0000-4000-8000-000000000001' from public.office_reviews where id=:'review'),
 'the review saves who, when, the outcome and the linked instruction, and its safe retry returns the same record');
select test.expect_error(format('select public.record_office_review(gen_random_uuid(),%L)',:'review_data'),array['23514'],
 'an inspection result is reviewed once');
select gen_random_uuid() as handover_review_key \gset
select public.record_office_review(:'handover_review_key',jsonb_build_object('subject','handover','subject_id',:'handover','outcome','noted',
 'note','Daywork to be confirmed with the main contractor.')) as handover_review \gset
select test.expect_error(format('select public.record_office_review(%L,jsonb_build_object(''subject'',''handover'',''subject_id'',%L,''outcome'',''noted'',''note'',''Changed note''))',:'handover_review_key',:'handover'),array['22023'],
 'a review key cannot be reused with a different note');

select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000002"}',true);
select test.assert((select count(*)=2 from public.office_reviews),
 'the supervisor sees that the office reviewed their inspection result and handover');
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000003"}',true);
select test.assert((select count(*)=1 and bool_and(handover_id=:'handover') from public.office_reviews),
 'another supervisor on the site sees the handover review, never the review of a result they cannot see');
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000005"}',true);
select test.assert((select count(*)=0 from public.office_reviews) and (select count(*)=0 from public.supervisor_office_item_withdrawals),
 'an unassigned manager sees no reviews or withdrawals');
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000006"}',true);
select test.assert((select count(*)=0 from public.office_reviews) and (select count(*)=0 from public.supervisor_office_item_withdrawals),
 'an installer sees no reviews or withdrawals');
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000007"}',true);
select test.assert((select count(*)=0 from public.office_reviews) and (select count(*)=0 from public.supervisor_office_item_withdrawals),
 'another organisation sees no reviews or withdrawals');
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000004"}',true);
select test.expect_error(format('update public.office_reviews set note=''Rewritten'' where id=%L',:'review'),array['42501'],
 'signed-in clients cannot rewrite a review');
select test.expect_error(format('delete from public.supervisor_office_item_withdrawals where id=%L',:'withdrawal'),array['42501'],
 'signed-in clients cannot delete a withdrawal');

-- Removing the assignment removes the supervisor's view of reviews and withdrawals.
reset role;
select test.assert((select count(*)=2 from public.audit_events where entity_type='office_reviews')
 and (select count(*)=3 from public.audit_events where entity_type='supervisor_office_item_withdrawals'),
 'every review and withdrawal has an audit event');
select test.expect_error(format('update public.office_reviews set outcome=''snag_raised'' where id=%L',:'review'),array['42501'],
 'append-only trigger protects a review even beyond client grants');
select test.expect_error(format('delete from public.supervisor_office_item_withdrawals where id=%L',:'withdrawal'),array['42501'],
 'append-only trigger protects a withdrawal even beyond client grants');
delete from public.contract_assignments where contract_id='db330000-0000-4000-8000-000000000001' and user_id='db310000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"db310000-0000-4000-8000-000000000002"}',true);
select test.assert((select count(*)=0 from public.office_reviews) and (select count(*)=0 from public.supervisor_office_item_withdrawals
 where contract_id='db330000-0000-4000-8000-000000000001'),
 'a revoked site assignment removes the supervisor''s view of reviews and withdrawals');
select test.expect_error(format('select public.acknowledge_supervisor_office_item(%L,%L)',:'first',:'early_ack_key'),array['42501'],
 'an old acknowledgement key cannot bypass a revoked assignment');
rollback;
