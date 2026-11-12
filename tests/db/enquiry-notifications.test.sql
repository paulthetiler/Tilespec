-- Email alerts for website enquiries: one alert per confirmed enquiry, claimed once, retried with back-off,
-- logged permanently, readable only by the office, and never able to fail the visitor's enquiry.
-- Disposable database only.
begin;
insert into auth.users(id,email) values
 ('e7a10000-0000-4000-8000-000000000001','alerts-owner@example.invalid'),
 ('e7a10000-0000-4000-8000-000000000002','alerts-manager@example.invalid'),
 ('e7a10000-0000-4000-8000-000000000003','alerts-supervisor@example.invalid');
insert into public.organisations(id,name) values ('e7a20000-0000-4000-8000-000000000001','Enquiry alerts test');
insert into public.organisation_members(organisation_id,user_id,display_name,role,active)
select 'e7a20000-0000-4000-8000-000000000001',id,name,role::public.operations_role,true from (values
 ('e7a10000-0000-4000-8000-000000000001'::uuid,'Alerts owner','owner'),
 ('e7a10000-0000-4000-8000-000000000002'::uuid,'Alerts manager','contracts_manager'),
 ('e7a10000-0000-4000-8000-000000000003'::uuid,'Alerts supervisor','supervisor')) people(id,name,role);
select test.assert((select count(*)=0 from public.enquiry_notifications),'no alert exists before any enquiry is confirmed');

-- A visitor sends a tender with one drawing.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select public.submit_tender_enquiry('{"kind":"tender","name":"Ada Buyer","email":"ada@example.invalid","company":"Example Build Ltd","project":"Office fit-out","deadline":"2027-02-01","message":"Please price.","files":[{"name":"Plan.pdf","size":9,"type":"application/pdf"}]}') as sent \gset
select (:'sent'::jsonb)->>'id' as enquiry \gset
select (:'sent'::jsonb)->>'token' as token \gset
select (:'sent'::jsonb)->'files'->0->>'path' as path \gset
select test.assert(public.complete_tender_enquiry(:'enquiry',:'token')='pending','the enquiry waits for its drawing');
reset role;
select test.assert((select count(*)=0 from public.enquiry_notifications),'no alert is queued until every file has arrived');
insert into storage.objects(bucket_id,name,metadata) values('tilespec-tenders',:'path','{"size":9,"mimetype":"application/pdf"}');
set local role anon;
select test.assert(public.complete_tender_enquiry(:'enquiry',:'token')='received' and public.complete_tender_enquiry(:'enquiry',:'token')='received',
 'the enquiry is received, and a repeated confirmation is harmless');
reset role;
select test.assert((select count(*)=1 and bool_and(status='pending' and attempts=0 and next_attempt_at<=now()) from public.enquiry_notifications where enquiry_id=:'enquiry'),
 'confirming the enquiry queued exactly one alert in the same transaction, even when confirmed twice');
select id as alert from public.enquiry_notifications where enquiry_id=:'enquiry' \gset

-- The first attempt, by the server holding the visitor's token.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select test.expect_error('select count(*) from public.enquiry_notifications',array['42501'],'a signed-out visitor cannot read the alert queue');
select test.expect_error('select count(*) from public.enquiry_notification_attempts',array['42501'],'a signed-out visitor cannot read the attempt log');
select test.expect_error(format('select public.claim_submitted_enquiry_notification(%L,%L)',:'enquiry',repeat('0',48)),array['42501'],
 'an alert cannot be claimed without the enquiry''s own token');
select test.expect_error(format('select public.claim_submitted_enquiry_notification(%L,%L)',gen_random_uuid(),:'token'),array['42501'],
 'a token does not open another enquiry''s alert');
select public.claim_submitted_enquiry_notification(:'enquiry',:'token') as claimed \gset
select (:'claimed'::jsonb)->>'claim' as claim \gset
select test.assert((:'claimed'::jsonb)->>'notification'=:'alert' and (:'claimed'::jsonb)->>'attempt'='1'
 and (:'claimed'::jsonb)->'enquiry'->>'reference' ~ '^TS-[0-9A-F]{8}$' and (:'claimed'::jsonb)->'enquiry'->>'name'='Ada Buyer'
 and (:'claimed'::jsonb)->'enquiry'->>'company'='Example Build Ltd' and (:'claimed'::jsonb)->'enquiry'->>'email'='ada@example.invalid'
 and (:'claimed'::jsonb)->'enquiry'->>'project'='Office fit-out' and (:'claimed'::jsonb)->'enquiry'->>'deadline'='2027-02-01'
 and (:'claimed'::jsonb)->'enquiry'->'files'='[{"name":"Plan.pdf","size":9}]'::jsonb,
 'the claim carries what the email needs: customer, company, email, project, reference and file names');
select test.assert(position(:'path' in :'claimed')=0 and position(:'token' in :'claimed')=0 and position('token_hash' in :'claimed')=0 and position('path' in :'claimed')=0,
 'the claim never carries a file''s storage path, the token or its fingerprint');
select test.assert(public.claim_submitted_enquiry_notification(:'enquiry',:'token') is null,'a duplicate request cannot claim the alert again');

-- The attempt fails; it is logged and scheduled for the retry, not for the visitor's token.
select test.expect_error(format('select public.report_enquiry_notification(%L,''sent'',''info@tilespec.uk'',null,null)',:'claim'),array['22023'],
 'an alert cannot be marked sent without the email service''s message id');
select test.expect_error(format('select public.report_enquiry_notification(%L,''sent'',''info@tilespec.uk'',''re_x'',null)',gen_random_uuid()),array['23514'],
 'an outcome can be reported only with the id of a current claim');
select test.assert(public.report_enquiry_notification(:'claim','failed','info@tilespec.uk',null,'Email service did not answer in time')='retry','a failed attempt is retried');
select test.expect_error(format('select public.report_enquiry_notification(%L,''sent'',''info@tilespec.uk'',''re_late'',null)',:'claim'),array['23514'],
 'the same attempt cannot be reported twice');
select test.assert(public.claim_submitted_enquiry_notification(:'enquiry',:'token') is null,'retries belong to the schedule and the office, not to the visitor''s token');
reset role;
select test.assert((select status='pending' and attempts=1 and next_attempt_at=now()+interval '2 minutes' and last_error='Email service did not answer in time'
   and recipient='info@tilespec.uk' and claim_id is null from public.enquiry_notifications where id=:'alert')
 and (select count(*)=1 and bool_and(result='failed' and via='submission') from public.enquiry_notification_attempts where notification_id=:'alert'),
 'the failure is logged and the alert waits two minutes for its next attempt');

-- The scheduled retry needs the owner's key.
set local role anon;
select test.expect_error(format('select count(*) from public.claim_due_enquiry_notifications(%L,10)',repeat('x',64)),array['42501'],'the schedule cannot claim before a retry key exists');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e7a10000-0000-4000-8000-000000000002"}',true);
select test.expect_error('select public.rotate_enquiry_notification_key()',array['42501'],'a contracts manager cannot create the retry key');
select set_config('request.jwt.claims','{"sub":"e7a10000-0000-4000-8000-000000000003"}',true);
select test.expect_error('select public.rotate_enquiry_notification_key()',array['42501'],'a supervisor cannot create the retry key');
select set_config('request.jwt.claims','{"sub":"e7a10000-0000-4000-8000-000000000001"}',true);
select public.rotate_enquiry_notification_key() as retry_key \gset
select test.assert(:'retry_key' ~ '^[0-9a-f]{64}$' and (select retry_key_set_at is not null from public.enquiry_notification_settings),'the owner creates a retry key');
reset role;
select test.assert((select retry_key_hash=encode(sha256(convert_to(:'retry_key','UTF8')),'hex') from public.enquiry_notification_settings),'only the key''s fingerprint is stored');
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select test.expect_error(format('select count(*) from public.claim_due_enquiry_notifications(%L,10)',repeat('x',64)),array['42501'],'a wrong retry key is refused');
select test.assert((select count(*)=0 from public.claim_due_enquiry_notifications(:'retry_key',10)),'an alert is not retried before its time');
reset role;
update public.enquiry_notifications set next_attempt_at=now()-interval '1 second' where id=:'alert';
set local role anon;
select x as due from public.claim_due_enquiry_notifications(:'retry_key',10) x \gset
select (:'due'::jsonb)->>'claim' as claim \gset
select test.assert((:'due'::jsonb)->>'notification'=:'alert' and (:'due'::jsonb)->>'attempt'='2','the due alert is claimed by the schedule');
select test.assert((select count(*)=0 from public.claim_due_enquiry_notifications(:'retry_key',10)),'an alert being sent is not claimed by a second sender');
select test.assert(public.report_enquiry_notification(:'claim','sent','info@tilespec.uk','re_123',null)='sent','the retry is sent');
select test.assert((select count(*)=0 from public.claim_due_enquiry_notifications(:'retry_key',10)),'a sent alert is never due again');
reset role;
select test.assert((select status='sent' and attempts=2 and sent_at is not null and provider_message_id='re_123' and last_error is null and claim_id is null
   from public.enquiry_notifications where id=:'alert')
 and (select array_agg(via||':'||result order by id)=array['submission:failed','schedule:sent'] from public.enquiry_notification_attempts where notification_id=:'alert'),
 'the alert is recorded as sent with every attempt in the log');
select test.expect_error(format('update public.enquiry_notification_attempts set error=''rewritten'' where notification_id=%L',:'alert'),array['42501'],'the attempt log cannot be rewritten');
select test.expect_error(format('delete from public.enquiry_notification_attempts where notification_id=%L',:'alert'),array['42501'],'the attempt log cannot be deleted');

-- The office reads alerts beside the enquiries, and cannot send one twice.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e7a10000-0000-4000-8000-000000000001"}',true);
select test.expect_error(format('select public.claim_enquiry_notification_for_office(%L)',:'alert'),array['23514'],'the owner cannot resend an alert that was already sent');
select set_config('request.jwt.claims','{"sub":"e7a10000-0000-4000-8000-000000000002"}',true);
select test.assert((select count(*)=1 from public.enquiry_notifications where id=:'alert' and status='sent') and (select count(*)=2 from public.enquiry_notification_attempts),
 'a contracts manager sees each enquiry''s alert and its attempts');
select test.expect_error('select claim_id from public.enquiry_notifications',array['42501'],'nobody can read a claim id');
select test.expect_error('select retry_key_hash from public.enquiry_notification_settings',array['42501'],'nobody can read the retry key''s fingerprint');
select test.expect_error(format('update public.enquiry_notifications set status=''pending'' where id=%L',:'alert'),array['42501'],'the queue is read-only through the API');
select set_config('request.jwt.claims','{"sub":"e7a10000-0000-4000-8000-000000000003"}',true);
select test.assert((select count(*)=0 from public.enquiry_notifications) and (select count(*)=0 from public.enquiry_notification_attempts),'a supervisor sees no enquiry alerts');
select test.expect_error(format('select public.claim_enquiry_notification_for_office(%L)',:'alert'),array['42501'],'a supervisor cannot send an enquiry alert');
reset role;

-- A general enquiry without files: the sender stops mid-attempt, and the attempt is counted and taken over.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select public.submit_tender_enquiry('{"kind":"general","name":"Ben Client","email":"ben@example.invalid"}') as sent2 \gset
select (:'sent2'::jsonb)->>'id' as enquiry2 \gset
select (:'sent2'::jsonb)->>'token' as token2 \gset
select test.assert(public.complete_tender_enquiry(:'enquiry2',:'token2')='received','an enquiry without files is received at once');
select public.claim_submitted_enquiry_notification(:'enquiry2',:'token2')->>'claim' as stopped \gset
reset role;
select id as alert2 from public.enquiry_notifications where enquiry_id=:'enquiry2' \gset
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e7a10000-0000-4000-8000-000000000002"}',true);
select test.expect_error(format('select public.claim_enquiry_notification_for_office(%L)',:'alert2'),array['23514'],'an alert being sent now is not sent again from the inbox');
reset role;
update public.enquiry_notifications set claimed_at=now()-interval '11 minutes' where id=:'alert2';
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select x->>'claim' as taken from public.claim_due_enquiry_notifications(:'retry_key',10) x \gset
select test.expect_error(format('select public.report_enquiry_notification(%L,''sent'',''info@tilespec.uk'',''re_late'',null)',:'stopped'),array['23514'],
 'the stopped sender''s late report cannot overwrite the new attempt');
reset role;
select test.assert((select status='sending' and attempts=1 and claimed_via='schedule' from public.enquiry_notifications where id=:'alert2')
 and (select count(*)=1 from public.enquiry_notification_attempts where notification_id=:'alert2' and result='failed' and error='No outcome was reported for this attempt'),
 'an attempt that never reported is counted as failed and claimed again after ten minutes');

-- After eight attempts the schedule stops, and the office can still send it.
update public.enquiry_notifications set attempts=7 where id=:'alert2';
set local role anon;
select test.assert(public.report_enquiry_notification(:'taken','failed','info@tilespec.uk',null,'Email service refused the message (403 validation_error)')='failed',
 'the eighth failed attempt stops the automatic retries');
reset role;
update public.enquiry_notifications set next_attempt_at=now()-interval '1 day' where id=:'alert2';
set local role anon;
select test.assert((select count(*)=0 from public.claim_due_enquiry_notifications(:'retry_key',10)),'a failed alert is not retried automatically');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e7a10000-0000-4000-8000-000000000002"}',true);
select public.claim_enquiry_notification_for_office(:'alert2')->>'claim' as office_claim \gset
select test.assert(public.report_enquiry_notification(:'office_claim','sent','info@tilespec.uk','re_office',null)='sent','a contracts manager sends a failed alert from the inbox');
reset role;
select test.assert((select status='sent' and attempts=9 from public.enquiry_notifications where id=:'alert2')
 and (select actor_id='e7a10000-0000-4000-8000-000000000002' and via='office' from public.enquiry_notification_attempts where notification_id=:'alert2' order by id desc limit 1),
 'the office attempt is logged with who sent it');

-- If the alert cannot be queued, the enquiry is still received.
alter table public.enquiry_notifications add constraint test_refuse_alerts check (false) not valid;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select public.submit_tender_enquiry('{"kind":"general","name":"Cal Client","email":"cal@example.invalid"}') as sent3 \gset
select test.assert(public.complete_tender_enquiry(((:'sent3'::jsonb)->>'id')::uuid,(:'sent3'::jsonb)->>'token')='received','a failure to queue the alert never fails the visitor''s enquiry');
reset role;
select test.assert((select status='received' from public.tender_enquiries where id=((:'sent3'::jsonb)->>'id')::uuid)
 and not exists(select 1 from public.enquiry_notifications where enquiry_id=((:'sent3'::jsonb)->>'id')::uuid),'the enquiry is kept in the inbox');
alter table public.enquiry_notifications drop constraint test_refuse_alerts;
rollback;
