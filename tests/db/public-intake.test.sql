-- The public enquiry form, the office tender inbox and their files, without a service key.
-- Disposable database only.
begin;
insert into auth.users(id,email) values
 ('d1a10000-0000-4000-8000-000000000001','intake-owner@example.invalid'),
 ('d1a10000-0000-4000-8000-000000000002','intake-manager@example.invalid'),
 ('d1a10000-0000-4000-8000-000000000003','intake-supervisor@example.invalid'),
 ('d1a10000-0000-4000-8000-000000000004','intake-installer@example.invalid'),
 ('d1a10000-0000-4000-8000-000000000005','intake-former-manager@example.invalid');
insert into public.organisations(id,name) values ('d1a20000-0000-4000-8000-000000000001','Public intake test');
insert into public.organisation_members(organisation_id,user_id,display_name,role,active)
select 'd1a20000-0000-4000-8000-000000000001',id,name,role::public.operations_role,active from (values
 ('d1a10000-0000-4000-8000-000000000001'::uuid,'Intake owner','owner',true),
 ('d1a10000-0000-4000-8000-000000000002'::uuid,'Intake manager','contracts_manager',true),
 ('d1a10000-0000-4000-8000-000000000003'::uuid,'Intake supervisor','supervisor',true),
 ('d1a10000-0000-4000-8000-000000000004'::uuid,'Intake installer','subcontract_installer',true),
 ('d1a10000-0000-4000-8000-000000000005'::uuid,'Former manager','contracts_manager',false)) people(id,name,role,active);

-- A signed-out visitor sends an enquiry with one drawing.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select test.expect_error($q$select public.submit_tender_enquiry('{"name":"","email":"a@b.co"}')$q$,array['22023'],'an enquiry needs a name');
select test.expect_error($q$select public.submit_tender_enquiry('{"name":"Sam","email":"not-an-email"}')$q$,array['22023'],'an enquiry needs a valid email');
select test.expect_error($q$select public.submit_tender_enquiry('{"name":"Sam","email":"a@b.co","files":[{"name":"run.exe","size":10,"type":""}]}')$q$,array['22023'],'only document, drawing and image files are accepted');
select test.expect_error($q$select public.submit_tender_enquiry('{"name":"Sam","email":"a@b.co","files":[{"name":"big.pdf","size":26214401,"type":""}]}')$q$,array['22023'],'a file over 25 MB is refused');
select test.expect_error($q$select public.submit_tender_enquiry('{"name":"Sam","email":"a@b.co","files":[{"name":"../../x.pdf","size":-1,"type":""}]}')$q$,array['22023'],'a file must declare a real size');
select test.expect_error(format('select public.submit_tender_enquiry(%L)',jsonb_build_object('name','Sam','email','a@b.co','files',
 (select jsonb_agg(jsonb_build_object('name','f'||n||'.pdf','size',10,'type','application/pdf')) from generate_series(1,11) n))::text),array['22023'],'at most ten files per enquiry');
select public.submit_tender_enquiry('{"kind":"tender","name":"  Sam Buyer ","email":"sam@example.invalid","company":"Example Build Ltd","project":"School refurbishment","deadline":"2027-01-15","message":"Please price the attached.","files":[{"name":"../plans/Ground Floor.PDF","size":9,"type":"application/pdf"}]}') as sent \gset
select (:'sent'::jsonb)->>'id' as enquiry \gset
select (:'sent'::jsonb)->>'token' as token \gset
select (:'sent'::jsonb)->'files'->0->>'path' as path \gset
select test.assert((:'sent'::jsonb)->>'reference' ~ '^TS-[0-9A-F]{8}$' and :'token' ~ '^[0-9a-f]{48}$' and :'path' ~ ('^'||:'enquiry'||'/[0-9a-f-]{36}\.pdf$'),
 'the visitor receives a reference, a one-time token and a reserved file path that ignores the name they typed');
select test.expect_error('select count(*) from public.tender_enquiries',array['42501'],'a signed-out visitor cannot read any enquiry, including their own');
select test.expect_error(format('insert into storage.objects(bucket_id,name,metadata) values(''tilespec-tenders'',%L,''{"size":9}'')',:'enquiry'||'/00000000-0000-4000-8000-000000000001.pdf'),
 array['42501'],'a file cannot be stored at a path that was not reserved');
select test.expect_error($q$insert into storage.objects(bucket_id,name,metadata) values('supervisor-evidence','x/y.png','{"size":9}')$q$,array['42501'],'a visitor cannot store anything in site evidence');
select test.expect_error(format('select public.complete_tender_enquiry(%L,%L)',:'enquiry',repeat('0',48)),array['42501'],'an enquiry cannot be confirmed without its own token');
select test.assert(public.complete_tender_enquiry(:'enquiry',:'token')='pending','an enquiry is not received until its files have arrived');
insert into storage.objects(bucket_id,name,metadata) values('tilespec-tenders',:'path','{"size":8,"mimetype":"application/pdf"}');
select test.assert(public.complete_tender_enquiry(:'enquiry',:'token')='pending','a file of the wrong size does not complete an enquiry');
select test.assert((select count(*)=0 from storage.objects),'a visitor cannot read or list stored files, even the one they just sent');
update storage.objects set metadata='{"size":9}' where name=:'path';
delete from storage.objects where name=:'path';
reset role;
select test.assert((select metadata->>'size'='8' from storage.objects where name=:'path'),'a visitor cannot replace or delete a stored file');
update storage.objects set metadata='{"size":9,"mimetype":"application/pdf"}' where name=:'path';
select test.assert((select name='Sam Buyer' and status='uploading' and token_hash<>:'token' and attachments->0->>'name'='.._plans_Ground Floor.PDF'
 from public.tender_enquiries where id=:'enquiry'),'the enquiry is trimmed, keeps only the token''s fingerprint and a harmless file name');
set local role anon;
select test.assert(public.complete_tender_enquiry(:'enquiry',:'token')='received' and public.complete_tender_enquiry(:'enquiry',:'token')='received',
 'once every file has arrived the enquiry is received, and a retry is harmless');
select test.expect_error(format('insert into storage.objects(bucket_id,name,metadata) values(''tilespec-tenders'',%L,''{"size":9}'')',:'path'),
 array['42501','23505'],'nothing more can be stored against a received enquiry');

-- The office inbox, in each person's own session.
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d1a10000-0000-4000-8000-000000000001"}',true);
select test.assert((select count(*)=1 from public.tender_enquiries where id=:'enquiry' and status='received')
 and (select count(*)=1 from storage.objects where bucket_id='tilespec-tenders' and name=:'path'),'the owner reads the enquiry and its file');
select test.expect_error('select token_hash from public.tender_enquiries',array['42501'],'nobody signed in can read an enquiry''s token fingerprint');
select test.expect_error(format('update public.tender_enquiries set status=''declined'' where id=%L',:'enquiry'),array['42501'],'the inbox is read-only through the API');
select set_config('request.jwt.claims','{"sub":"d1a10000-0000-4000-8000-000000000002"}',true);
select test.assert((select count(*)=1 from public.tender_enquiries) and (select count(*)=1 from storage.objects where bucket_id='tilespec-tenders'),'a contracts manager reads the inbox');
select set_config('request.jwt.claims','{"sub":"d1a10000-0000-4000-8000-000000000003"}',true);
select test.assert((select count(*)=0 from public.tender_enquiries) and (select count(*)=0 from storage.objects where bucket_id='tilespec-tenders'),'a supervisor sees no enquiries or their files');
select set_config('request.jwt.claims','{"sub":"d1a10000-0000-4000-8000-000000000004"}',true);
select test.assert((select count(*)=0 from public.tender_enquiries) and (select count(*)=0 from storage.objects where bucket_id='tilespec-tenders'),'a gang sees no enquiries or their files');
select set_config('request.jwt.claims','{"sub":"d1a10000-0000-4000-8000-000000000005"}',true);
select test.assert((select count(*)=0 from public.tender_enquiries) and (select count(*)=0 from storage.objects where bucket_id='tilespec-tenders'),'a deactivated manager sees nothing');

-- A burst is refused.
reset role;
insert into public.tender_enquiries(reference,kind,name,email,token_hash)
select 'TS-BURST'||n,'general','Burst','burst@example.invalid',repeat('0',64) from generate_series(1,30) n;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select test.expect_error($q$select public.submit_tender_enquiry('{"name":"Sam","email":"a@b.co"}')$q$,array['53400'],'a burst of enquiries is refused instead of filling the inbox');
reset role;
rollback;
