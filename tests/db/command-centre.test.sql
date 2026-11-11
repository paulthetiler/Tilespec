-- Office command centre: customers, job stages, quotations and tenders, materials, progress and
-- photographs, message decisions, search, debt and cash flow, and the notification outbox.
-- Disposable database only.
begin;
insert into auth.users(id,email) values
 ('cc510000-0000-4000-8000-000000000001','cc-owner@example.invalid'),
 ('cc510000-0000-4000-8000-000000000002','cc-money-manager@example.invalid'),
 ('cc510000-0000-4000-8000-000000000003','cc-manager@example.invalid'),
 ('cc510000-0000-4000-8000-000000000004','cc-supervisor@example.invalid'),
 ('cc510000-0000-4000-8000-000000000005','cc-other-supervisor@example.invalid'),
 ('cc510000-0000-4000-8000-000000000006','cc-installer@example.invalid'),
 ('cc510000-0000-4000-8000-000000000007','cc-outsider@example.invalid');
insert into public.organisations(id,name) values
 ('cc520000-0000-4000-8000-000000000001','Command centre test'),('cc520000-0000-4000-8000-000000000002','Other command centre test');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access)
select 'cc520000-0000-4000-8000-000000000001',id,name,role::public.operations_role,money from (values
 ('cc510000-0000-4000-8000-000000000001'::uuid,'CC owner','owner',false),
 ('cc510000-0000-4000-8000-000000000002'::uuid,'CC money manager','contracts_manager',true),
 ('cc510000-0000-4000-8000-000000000003'::uuid,'CC manager','contracts_manager',false),
 ('cc510000-0000-4000-8000-000000000004'::uuid,'CC supervisor','supervisor',false),
 ('cc510000-0000-4000-8000-000000000005'::uuid,'CC other supervisor','supervisor',false),
 ('cc510000-0000-4000-8000-000000000006'::uuid,'CC installer','subcontract_installer',false)) people(id,name,role,money);
insert into public.organisation_members(organisation_id,user_id,display_name,role) values
 ('cc520000-0000-4000-8000-000000000002','cc510000-0000-4000-8000-000000000007','CC outsider','owner');
insert into public.organisations(id,name) select 'cc520000-0000-4000-8000-000000000003','unused' where false;
insert into public.contracts(id,organisation_id,reference,name,client,created_by,start_date,end_date) values
 ('cc530000-0000-4000-8000-000000000001','cc520000-0000-4000-8000-000000000001','CC-1','Fictional command centre site','Fictional Client Ltd','cc510000-0000-4000-8000-000000000001',current_date-10,current_date+30),
 ('cc530000-0000-4000-8000-000000000002','cc520000-0000-4000-8000-000000000001','CC-2','Second command centre site','','cc510000-0000-4000-8000-000000000001',current_date+5,current_date+60);
insert into public.contract_assignments(organisation_id,contract_id,user_id)
select 'cc520000-0000-4000-8000-000000000001','cc530000-0000-4000-8000-000000000001',u::uuid from (values
 ('cc510000-0000-4000-8000-000000000002'),('cc510000-0000-4000-8000-000000000003'),('cc510000-0000-4000-8000-000000000004')) a(u);
insert into public.contract_assignments(organisation_id,contract_id,user_id) values
 ('cc520000-0000-4000-8000-000000000001','cc530000-0000-4000-8000-000000000002','cc510000-0000-4000-8000-000000000005');
insert into public.notification_settings(organisation_id) values ('cc520000-0000-4000-8000-000000000001') on conflict do nothing;

-- Text that only says "nothing to report" is not a problem to review.
select test.assert(not private.meaningful_text('none') and not private.meaningful_text('None, good day') and not private.meaningful_text('n/a')
  and not private.meaningful_text('  ') and not private.meaningful_text(null) and not private.meaningful_text('All good.')
  and private.meaningful_text('Scaffold blocking the stair core') and private.meaningful_text('Need 20 bags of adhesive'),
  '"none", "n/a" and "all good" do not count as problems; real notes do');

set local role authenticated;
-- Owner: stages, customers.
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000001"}',true);
select test.assert((select lifecycle_stage='won' from public.contracts where id='cc530000-0000-4000-8000-000000000002'), 'a new job starts as won');
select public.set_contract_stage(gen_random_uuid(),'cc530000-0000-4000-8000-000000000001','live',null) as stage_event \gset
select test.assert((select lifecycle_stage='live' from public.contracts where id='cc530000-0000-4000-8000-000000000001')
  and (select count(*)=1 from public.contract_stage_events where contract_id='cc530000-0000-4000-8000-000000000001' and to_stage='live' and from_stage='won'),
  'the owner moves a job to live and the change is recorded');
select test.expect_error('select public.set_contract_stage(gen_random_uuid(),''cc530000-0000-4000-8000-000000000001'',''on_hold'',null)',array['22023'],
  'putting a job on hold needs a reason');
select test.expect_error('select public.set_contract_stage(gen_random_uuid(),''cc530000-0000-4000-8000-000000000001'',''live'',null)',array['23514'],
  'a job cannot be moved to the stage it is already at');
select test.expect_error('update public.contract_stage_events set note=''changed''',array['42501','P0001'],'stage history cannot be edited');
select public.save_customer(gen_random_uuid(),jsonb_build_object('name','Fictional Builders plc','kind','main_contractor','email','Accounts@Example.invalid')) as customer \gset
select test.assert((select email='accounts@example.invalid' and kind='main_contractor' from public.customers where id=:'customer'), 'the office adds a customer');
select public.set_contract_customer('cc530000-0000-4000-8000-000000000002',:'customer');
select test.assert((select customer_id=:'customer' and client='Fictional Builders plc' from public.contracts where id='cc530000-0000-4000-8000-000000000002'),
  'a job is linked to its customer and shows the customer name');
select test.expect_error('select public.save_customer(gen_random_uuid(),jsonb_build_object(''name'',''fictional builders PLC''))',array['23505'],
  'the same customer cannot be added twice');

-- Quotations need money access. The owner has it.
select public.save_quote(gen_random_uuid(),jsonb_build_object('customer_id',:'customer','title','Hotel bathrooms phase 2','value_net',48250.5,'estimated_cost',39000)) as quote \gset
select public.save_quote(gen_random_uuid(),jsonb_build_object('title','Small office kitchen','value_net',3200)) as quote2 \gset
select test.assert((select reference='Q-00001' and status='draft' from public.quotes where id=:'quote') and (select reference='Q-00002' from public.quotes where id=:'quote2'),
  'quotations are numbered in order');
select test.expect_error(format('select public.set_quote_status(gen_random_uuid(),%L,1,''{"status":"accepted"}'')',:'quote'),array['23514'],
  'a quotation is sent before it can be accepted');
select public.set_quote_status(gen_random_uuid(),:'quote',1,jsonb_build_object('status','sent','on',current_date-10));
select test.assert((select status='sent' and issued_on=current_date-10 and follow_up_on=current_date-3 and valid_until=current_date+20 from public.quotes where id=:'quote'),
  'sending sets the issue date, a follow-up a week later and a 30-day validity');
select public.set_quote_status(gen_random_uuid(),:'quote',2,jsonb_build_object('status','accepted','contract_id','cc530000-0000-4000-8000-000000000002'));
select test.assert((select status='accepted' and decided_on=current_date and contract_id='cc530000-0000-4000-8000-000000000002' from public.quotes where id=:'quote')
  and (select count(*)=3 from public.quote_events where quote_id=:'quote'), 'an accepted quotation is linked to its job with its history');
select test.expect_error(format('select public.save_quote(gen_random_uuid(),jsonb_build_object(''id'',%L,''version'',3,''title'',''Changed after acceptance'',''value_net'',1))',:'quote'),array['23514'],
  'a decided quotation is not edited');
select test.assert((select count(*)>=1 from public.audit_events where entity_type='quotes' and commercial), 'quotation changes are audited as commercial records');

-- Messages: a supervisor asks for a decision; the office approves; the supervisor sees the answer.
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000004"}',true);
select public.post_job_message(gen_random_uuid(),jsonb_build_object('contract_id','cc530000-0000-4000-8000-000000000001','body','Can we use the alternative grout colour?',
  'category','decision','urgent',true)) as decision \gset
select test.assert((select category='decision' and urgent and needs_answer from public.job_messages where id=:'decision'),
  'a decision request always waits for the office');
select test.expect_error(format('select public.post_job_message(gen_random_uuid(),jsonb_build_object(''contract_id'',''cc530000-0000-4000-8000-000000000001'',''thread_id'',%L,''body'',''More'',''category'',''problem''))',:'decision'),array['22023'],
  'a reply cannot carry its own category');
select test.expect_error(format('select public.record_thread_outcome(gen_random_uuid(),jsonb_build_object(''contract_id'',''cc530000-0000-4000-8000-000000000001'',''thread_id'',%L,''outcome'',''approved''))',:'decision'),array['42501'],
  'a supervisor cannot decide their own request');
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000003"}',true);
select public.record_thread_outcome(gen_random_uuid(),jsonb_build_object('contract_id','cc530000-0000-4000-8000-000000000001','thread_id',:'decision',
  'outcome','approved','note','Use the alternative colour on level 2 only')) as outcome \gset
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000004"}',true);
select test.assert((select count(*)=1 from public.job_thread_outcomes where thread_id=:'decision' and outcome='approved')
  and (select body='Decision: approved: Use the alternative colour on level 2 only' and author_side='office' and not needs_answer
    from public.job_messages where thread_id=:'decision' and id<>thread_id),
  'the supervisor sees the recorded decision in the conversation');
select public.post_job_message(gen_random_uuid(),jsonb_build_object('contract_id','cc530000-0000-4000-8000-000000000001','body','Is the lift booked tomorrow?','category','question')) as question \gset
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000003"}',true);
select test.expect_error(format('select public.record_thread_outcome(gen_random_uuid(),jsonb_build_object(''contract_id'',''cc530000-0000-4000-8000-000000000001'',''thread_id'',%L,''outcome'',''approved''))',:'question'),array['22023'],
  'a question is answered, not approved');
select test.expect_error(format('select public.record_thread_outcome(gen_random_uuid(),jsonb_build_object(''contract_id'',''cc530000-0000-4000-8000-000000000001'',''thread_id'',%L,''outcome'',''answered''))',:'question'),array['22023'],
  'an answer needs words');

-- Materials: requested on site, ordered by the office, delivery confirmed on site.
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000004"}',true);
select public.request_material(gen_random_uuid(),jsonb_build_object('contract_id','cc530000-0000-4000-8000-000000000001','item','Flexible adhesive','quantity',20,'unit','bag',
  'needed_by',current_date+2)) as material \gset
select test.assert((select status='requested' and source='site' and requested_by_name='CC supervisor' from public.material_requests where id=:'material'), 'a supervisor requests materials');
select test.expect_error(format('select public.update_material_request(%L,1,''{"status":"ordered","supplier":"Fictional Supplies"}'')',:'material'),array['42501'],
  'only the office orders materials');
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000003"}',true);
select public.update_material_request(:'material',1,jsonb_build_object('status','ordered','supplier','Fictional Supplies','order_reference','PO-1001','expected_on',current_date+1));
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000004"}',true);
select public.update_material_request(:'material',2,jsonb_build_object('status','delivered'));
select test.assert((select status='delivered' and delivered_on=current_date and ordered_on=current_date and supplier='Fictional Supplies' from public.material_requests where id=:'material')
  and (select count(*)=3 from public.material_request_events where request_id=:'material'), 'delivery is confirmed on site with the full history');
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000005"}',true);
select test.assert((select count(*)=0 from public.material_requests), 'a supervisor on another job sees none of these materials');
select test.expect_error('select public.request_material(gen_random_uuid(),jsonb_build_object(''contract_id'',''cc530000-0000-4000-8000-000000000001'',''item'',''Grout'',''quantity'',1,''unit'',''bag''))',array['42501'],
  'a supervisor cannot request materials for a job they are not on');

-- Progress quantities.
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000004"}',true);
select public.record_site_progress(gen_random_uuid(),jsonb_build_object('contract_id','cc530000-0000-4000-8000-000000000001','work_date',current_date-1,
  'description','Level 2 corridor floor tiled','quantity',42.5,'unit','m2')) as progress \gset
select test.assert((select quantity=42.5 and unit='m2' and work_date=current_date-1 from public.site_progress_entries where id=:'progress'), 'a supervisor records yesterday''s progress');
select test.expect_error('select public.record_site_progress(gen_random_uuid(),jsonb_build_object(''contract_id'',''cc530000-0000-4000-8000-000000000001'',''work_date'',current_date-30,''description'',''Old work''))',array['22023'],
  'progress is recorded for the last seven days only');
select test.expect_error('select public.record_site_progress(gen_random_uuid(),jsonb_build_object(''contract_id'',''cc530000-0000-4000-8000-000000000001'',''description'',''Half'',''quantity'',3))',array['22023'],
  'a quantity needs its unit');
select test.expect_error(format('update public.site_progress_entries set quantity=1 where id=%L',:'progress'),array['42501'],'progress entries cannot be edited');
select public.void_site_progress(:'progress','Entered against the wrong level');
select test.assert((select voided_at is not null from public.site_progress_entries where id=:'progress'), 'a mistaken entry is kept and marked as entered in error');

-- Site photographs.
select public.reserve_site_photo(gen_random_uuid(),'cc530000-0000-4000-8000-000000000001',jsonb_build_object('mime_type','image/jpeg','sha256',repeat('a',64),'bytes',1200,
  'caption','Level 2 corridor')) as photo \gset
select object_path as photo_path from public.site_photos where id=:'photo' \gset
insert into storage.objects(bucket_id,name,metadata) values('supervisor-evidence',:'photo_path','{"size":"1200","mimetype":"image/jpeg"}');
select public.confirm_site_photo(:'photo',repeat('a',64));
select test.assert((select uploaded_at is not null from public.site_photos where id=:'photo'), 'a site photograph is confirmed once its stored bytes match');
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000006"}',true);
select test.assert((select count(*)=0 from public.site_photos) and (select count(*)=0 from public.site_progress_entries),
  'an installer sees no site photographs or progress records');
select test.expect_error('select public.reserve_site_photo(gen_random_uuid(),''cc530000-0000-4000-8000-000000000001'',''{"mime_type":"image/jpeg","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","bytes":10}'')',array['42501'],
  'an installer cannot add site photographs');

-- Money boundaries: quotations, debt and cash flow need money access.
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000003"}',true);
select test.assert((select count(*)=0 from public.quotes), 'a manager without money access sees no quotations');
select test.expect_error('select public.save_quote(gen_random_uuid(),''{"title":"Not allowed","value_net":1}'')',array['42501'],'a manager without money access cannot price work');
select test.expect_error('select * from public.debtor_ledger()',array['42501'],'debt needs money access');
select test.expect_error('select * from public.cash_flow_lines(8)',array['42501'],'cash flow needs money access');
select test.assert((select count(*)=0 from public.office_search('Hotel bathrooms')), 'search never reveals a quotation to someone without money access');
select test.assert((select count(*)=1 from public.office_search('command centre site') where kind='job'), 'search finds the jobs a manager can see');
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000002"}',true);
select test.assert((select count(*)=0 from public.debtor_ledger()) and (select count(*)=0 from public.cash_flow_lines(8)), 'money access reads debt and cash flow (none recorded yet)');
select test.assert((select count(*)=1 from public.office_search('Hotel bathrooms') where kind='quote'), 'money access finds quotations by title');
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000004"}',true);
select test.assert((select count(*)=0 from public.office_search('Fictional Builders')), 'a supervisor finds no customers');
select test.assert((select count(*)=0 from public.customers), 'supervisors cannot read the customer list');

-- Notifications. Only the owner manages them; recipients are members' own sign-in addresses.
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000002"}',true);
select test.expect_error('select public.add_notification_recipient(''cc510000-0000-4000-8000-000000000002'',true,true)',array['42501'],'only the owner manages notifications');
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000001"}',true);
select test.expect_error('select public.add_notification_recipient(''cc510000-0000-4000-8000-000000000004'',true,true)',array['22023'],'supervisors do not receive office emails');
select public.add_notification_recipient('cc510000-0000-4000-8000-000000000001',true,true) as owner_recipient \gset
select public.add_notification_recipient('cc510000-0000-4000-8000-000000000003',true,true) as manager_recipient \gset
select test.assert((select email='cc-owner@example.invalid' and confirmed_at is null from public.notification_recipients where id=:'owner_recipient'),
  'a recipient uses their own sign-in address and starts unconfirmed');
select test.expect_error(format('select public.confirm_notification_recipient(%L)',:'owner_recipient'),array['23514'],'a recipient is confirmed only after a test message');
select test.expect_error('select public.set_notification_delivery(true,null,null)',array['23514'],'delivery cannot be switched on without a confirmed recipient');
select public.queue_test_notification(:'owner_recipient') as test_message \gset
select public.rotate_notification_dispatcher_key() as dispatcher_key \gset
select test.assert(length(:'dispatcher_key')=64 and (select dispatcher_token_hash=encode(sha256(convert_to(:'dispatcher_key','UTF8')),'hex') from public.notification_settings
  where organisation_id='cc520000-0000-4000-8000-000000000001'), 'only the dispatcher key''s hash is stored');

-- The scheduled dispatcher has no session and needs the key.
reset role;
set local role anon;
select set_config('request.jwt.claims','',true);
select test.expect_error('select * from public.dispatch_claim(''not-the-key-not-the-key-not-the-key-000'',10)',array['42501'],'a wrong dispatcher key is refused');
select test.expect_error('select * from public.notification_outbox',array['42501'],'anonymous callers cannot read the outbox');
select test.assert((select count(*)=1 and bool_and(kind='test' and live) from public.dispatch_claim(:'dispatcher_key',10)),
  'a test message is always delivered, even before notifications are switched on');
select public.dispatch_report(:'dispatcher_key',:'test_message','sent','provider-1',null);
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000001"}',true);
select public.confirm_notification_recipient(:'owner_recipient');
select test.assert((select status='sent' and provider_message_id='provider-1' from public.notification_outbox where id=:'test_message')
  and (select count(*)=1 from public.notification_attempts where outbox_id=:'test_message' and result='sent')
  and (select confirmed_at is not null from public.notification_recipients where id=:'owner_recipient'), 'the delivery is logged and the owner confirms the mailbox');

-- Urgent alerts: a safety stop and an urgent decision request reach confirmed recipients only, once each.
select public.create_locations('cc530000-0000-4000-8000-000000000001',gen_random_uuid(),null,'[{"name":"CC stair core"}]');
select id as stair from public.work_areas where name='CC stair core' \gset
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000004"}',true);
select public.create_work_hold(gen_random_uuid(),jsonb_build_object('contract_id','cc530000-0000-4000-8000-000000000001','work_area_id',:'stair','stage','installation',
 'activity','Stair tiling','hold_type','safety','category','Access','severity','critical','reason','Unprotected edge at the stair core',
 'required_action','Principal contractor to install edge protection','evidence_explanation','Seen on the walk round')) as safety_hold \gset
select public.post_job_message(gen_random_uuid(),jsonb_build_object('contract_id','cc530000-0000-4000-8000-000000000001','body','Main contractor wants us off level 3 now',
  'category','problem','urgent',true)) as problem \gset
reset role;
select test.assert((select count(*)=1 from public.notification_outbox where kind='urgent' and topic='safety_stop' and recipient_id=:'owner_recipient')
  and (select count(*)=0 from public.notification_outbox where recipient_id=:'manager_recipient'),
  'a safety stop queues one urgent email for the confirmed owner; an unconfirmed recipient gets nothing');
select test.assert((select count(*)=1 from public.notification_outbox where topic='urgent_problem' and recipient_id=:'owner_recipient'),
  'an urgent problem from site queues an urgent email');
select test.assert((select count(*)=0 from public.notification_outbox where topic='urgent_decision'),
  'urgent messages sent before the recipient was confirmed are not sent later');
-- The trigger never blocks the stop itself.
select test.assert((select count(*)=1 from public.work_holds where id=:'safety_hold'), 'the safety stop is saved');

-- Not switched on: urgent messages are claimed for a dry run only.
set local role anon;
select set_config('request.jwt.claims','',true);
select test.assert((select count(*)=2 and not bool_or(live) from public.dispatch_claim(:'dispatcher_key',10)), 'before switching on, urgent emails are dry runs');
reset role;
select id as urgent_one from public.notification_outbox where topic='safety_stop' \gset
select id as urgent_two from public.notification_outbox where topic='urgent_problem' \gset
set local role anon;
select public.dispatch_report(:'dispatcher_key',:'urgent_one','dry_run',null,null);
select public.dispatch_report(:'dispatcher_key',:'urgent_two','failed',null,'Provider timeout');
reset role;
select test.assert((select status='dry_run' from public.notification_outbox where id=:'urgent_one')
  and (select status='pending' and attempts=1 and next_attempt_at>now() and last_error='Provider timeout' from public.notification_outbox where id=:'urgent_two'),
  'a dry run is logged; a failed send is retried later with the error kept');
set local role anon;
select test.assert((select count(*)=0 from public.dispatch_claim(:'dispatcher_key',10)), 'a failed message waits for its retry time');
reset role;

-- Switch on, then the morning summary. Money appears only for a recipient with money access.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cc510000-0000-4000-8000-000000000001"}',true);
select public.set_notification_delivery(true,null,null);
select public.queue_test_notification(:'manager_recipient') as manager_test \gset
reset role;
set local role anon;
select public.dispatch_report(:'dispatcher_key',id,'sent','provider-2',null) from public.dispatch_claim(:'dispatcher_key',10) where kind='test';
reset role;
set local role authenticated;
select public.confirm_notification_recipient(:'manager_recipient');
reset role;
set local role anon;
select test.assert(public.dispatch_queue_summaries(:'dispatcher_key',(now() at time zone 'Europe/London')::date)=2 and public.dispatch_queue_summaries(:'dispatcher_key',(now() at time zone 'Europe/London')::date)=0,
  'one morning summary per confirmed recipient per day, never twice');
reset role;
select test.assert((select financial and payload ? 'money' from public.notification_outbox where kind='summary' and recipient_id=:'owner_recipient'),
  'the owner''s summary includes money');
select test.assert((select not financial and not (payload ? 'money') from public.notification_outbox where kind='summary' and recipient_id=:'manager_recipient'),
  'a manager without money access gets no money in the summary');
select test.assert((select jsonb_array_length(payload->'stops')=1 and jsonb_array_length(payload->'waiting')=2
  from public.notification_outbox where kind='summary' and recipient_id=:'owner_recipient'),
  'the summary lists the active stop and the two conversations waiting on the office (the decided one is not)');
-- A recipient who loses access before sending is suppressed, not emailed.
update public.organisation_members set active=false where user_id='cc510000-0000-4000-8000-000000000003';
set local role anon;
select test.assert((select count(*)=1 and bool_and(live) from public.dispatch_claim(:'dispatcher_key',10) where kind='summary'),
  'once switched on, the owner''s summary is claimed for delivery');
reset role;
select test.assert((select status='suppressed' from public.notification_outbox where kind='summary' and recipient_id=:'manager_recipient'),
  'a summary for someone no longer active is suppressed');
select test.assert((select count(*)=0 from public.notification_outbox where organisation_id='cc520000-0000-4000-8000-000000000002'),
  'nothing is queued for another organisation');
select test.expect_error('update public.notification_attempts set error=''x''',array['42501','P0001'],'the delivery log cannot be edited');
rollback;
