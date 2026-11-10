-- Gang invoices: gangs claim, supervisors verify, the office approves the money. Disposable database only.
begin;
\set owner 'a6000000-0000-4000-8000-000000000001'
\set faye 'a6000000-0000-4000-8000-000000000002'
\set mia 'a6000000-0000-4000-8000-000000000003'
\set sam 'a6000000-0000-4000-8000-000000000004'
\set sue 'a6000000-0000-4000-8000-000000000005'
\set dave 'a6000000-0000-4000-8000-000000000006'
\set mark 'a6000000-0000-4000-8000-000000000007'
\set gina 'a6000000-0000-4000-8000-000000000008'
\set org 'a6100000-0000-4000-8000-000000000001'
\set c1 'a6200000-0000-4000-8000-000000000001'
\set c2 'a6200000-0000-4000-8000-000000000002'
\set floor 'a6300000-0000-4000-8000-000000000001'
\set entrance 'a6300000-0000-4000-8000-000000000002'
\set hotel 'a6300000-0000-4000-8000-000000000003'
\set g1 'a6400000-0000-4000-8000-000000000001'
\set g2 'a6400000-0000-4000-8000-000000000002'
insert into auth.users(id,email) select id::uuid,id||'@example.invalid'
  from unnest(array[:'owner',:'faye',:'mia',:'sam',:'sue',:'dave',:'mark',:'gina']) id;
insert into public.organisations(id,name) values (:'org','Gang invoice test');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access)
select :'org',id::uuid,name,role::public.operations_role,money from (values
 (:'owner','Olive Owner','owner',true),(:'faye','Faye Finance','contracts_manager',true),(:'mia','Mia Manager','contracts_manager',false),
 (:'sam','Sam Supervisor','supervisor',false),(:'sue','Sue Supervisor','supervisor',false),
 (:'dave','Dave Tiler','lead_installer',false),(:'mark','Mark Tiler','subcontract_installer',false),(:'gina','Gina Tiler','subcontract_installer',false)) p(id,name,role,money);
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 (:'c1',:'org','SM-1','Supermarket refurbishment',:'owner'),(:'c2',:'org','HT-2','Hotel bathrooms',:'owner');
insert into public.work_areas(id,organisation_id,contract_id,name,created_by) values
 (:'floor',:'org',:'c1','Main shop floor',:'owner'),(:'entrance',:'org',:'c1','Entrance',:'owner'),(:'hotel',:'org',:'c2','Lobby',:'owner');
insert into public.contract_assignments(organisation_id,contract_id,user_id) values (:'org',:'c1',:'sam'),(:'org',:'c1',:'faye'),(:'org',:'c1',:'mia'),(:'org',:'c2',:'faye');
insert into public.teams(id,organisation_id,name,kind) values (:'g1',:'org','Gang 1 — Dave & Mark','subcontract_gang'),(:'g2',:'org','Gang 2 — Gina','subcontract_gang');
insert into public.operatives(id,organisation_id,display_name,engagement,user_id) values
 ('a6500000-0000-4000-8000-000000000001',:'org','Dave Tiler','subcontractor',:'dave'),
 ('a6500000-0000-4000-8000-000000000002',:'org','Mark Tiler','subcontractor',:'mark'),
 ('a6500000-0000-4000-8000-000000000003',:'org','Gina Tiler','subcontractor',:'gina');
insert into public.team_memberships(organisation_id,team_id,operative_id,is_lead,valid_from) values
 (:'org',:'g1','a6500000-0000-4000-8000-000000000001',true,current_date-30),
 (:'org',:'g1','a6500000-0000-4000-8000-000000000002',false,current_date-30),
 (:'org',:'g2','a6500000-0000-4000-8000-000000000003',true,current_date-30);

-- Payment dates: invoice Friday, paid the following Friday; fortnightly from an anchor; custom days.
select test.assert(private.gang_payment_due('weekly',5,7,null,'2026-11-06')='2026-11-13'
  and private.gang_payment_due('weekly',5,7,null,'2026-11-09')='2026-11-20'
  and private.gang_payment_due('fortnightly',5,7,'2026-11-06','2026-11-09')='2026-11-27'
  and private.gang_payment_due('fortnightly',5,7,'2026-11-06','2026-11-20')='2026-11-27'
  and private.gang_payment_due('custom',5,30,null,'2026-11-09')='2026-12-09',
  'weekly, fortnightly and custom payment dates follow the agreed terms');

set local role authenticated;
-- Office setup: only money access can put a gang on a job and agree its rates.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.expect_error(format('select public.save_gang_subcontract(jsonb_build_object(''contract_id'',%L,''team_id'',%L))',:'c1',:'g1'),array['42501'],
  'an office user without money access cannot set up gang terms');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'sam'),true);
select test.expect_error(format('select public.save_gang_subcontract(jsonb_build_object(''contract_id'',%L,''team_id'',%L))',:'c1',:'g1'),array['42501'],
  'a supervisor cannot set up gang terms');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.save_gang_subcontract(jsonb_build_object('contract_id',:'c1','team_id',:'g1','payment_cycle','weekly','pay_weekday',5,'payment_days',7)) as s1 \gset
select public.save_gang_subcontract(jsonb_build_object('contract_id',:'c1','team_id',:'g2','payment_cycle','fortnightly','cycle_anchor','2026-11-06')) as s2 \gset
select public.save_gang_subcontract(jsonb_build_object('contract_id',:'c2','team_id',:'g1','payment_cycle','custom','payment_days',14)) as s3 \gset
select public.save_gang_rate(gen_random_uuid(),jsonb_build_object('subcontract_id',:'s1','unit','m2','rate',18.5,'effective_from','2026-01-01')) as rate1 \gset
select public.save_gang_rate(gen_random_uuid(),jsonb_build_object('subcontract_id',:'s1','work_area_id',:'entrance','unit','m2','rate',22,'effective_from','2026-01-01'));
reset role;
select test.assert(private.gang_rate_for(:'s1',:'floor','m2',current_date)=18.5 and private.gang_rate_for(:'s1',:'entrance','m2',current_date)=22,
  'the agreed rate for a location prefers the location''s own rate over the job-wide rate');
set local role authenticated;
select test.expect_error(format('select public.save_gang_subcontract(jsonb_build_object(''contract_id'',%L,''team_id'',%L,''payment_days'',10,''version'',9))',:'c1',:'g1'),
  array['40001'],'stale terms cannot overwrite newer terms');

-- 1. The gang sends an invoice for 55 m² on the main shop floor.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert(jsonb_array_length(public.my_gang_jobs())=2 and public.my_gang_jobs()::text not like '%HT-3%',
  'the gang sees only the jobs its gang is set up on');
select gen_random_uuid() as key1 \gset
select jsonb_build_object('contract_id',:'c1','team_id',:'g1','invoice_number','INV-101','invoice_total',1017.5,'note','Week 45',
  'lines',jsonb_build_array(jsonb_build_object('work_area_id',:'floor','unit','m2','quantity',55)),
  'file',jsonb_build_object('mime_type','application/pdf','bytes',2048,'sha256',repeat('a',64)))::text as claim1 \gset
select public.submit_gang_invoice(:'key1',:'claim1'::jsonb) as inv1 \gset
select test.assert(public.submit_gang_invoice(:'key1',:'claim1'::jsonb)=:'inv1','a retried submission returns the same invoice and is not sent twice');
select test.assert((select status from public.gang_invoices where id=:'inv1')='uploading','the invoice waits for its document before it is sent');
select object_path as path1, id as file1 from public.gang_invoice_files where invoice_id=:'inv1' and kind='invoice' \gset
select test.expect_error(format('select public.complete_gang_file(%L)',:'file1'),array['22023'],'an invoice cannot be sent before its document is stored');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'gina'),true);
select test.expect_error(format('insert into storage.objects(bucket_id,name,metadata) values (''gang-claims'',%L,''{"size":2048,"mimetype":"application/pdf"}'')',:'path1'),
  array['42501'],'another gang cannot write into this invoice''s storage');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
insert into storage.objects(bucket_id,name,metadata) values ('gang-claims',:'path1','{"size":2048,"mimetype":"application/pdf"}');
select public.complete_gang_file(:'file1');
select public.complete_gang_file(:'file1');
select test.assert((select status from public.gang_invoices where id=:'inv1')='awaiting_check','storing the document sends the invoice for checking');
select test.expect_error(format('select public.submit_gang_invoice(gen_random_uuid(),%L::jsonb)',:'claim1'),array['22023'],
  'the same invoice document cannot be sent twice with a new request');
select test.expect_error(format('select public.submit_gang_invoice(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''team_id'',%L,''invoice_number'',''inv-101'',
  ''lines'',jsonb_build_array(jsonb_build_object(''work_area_id'',%L,''quantity'',5)),''file'',jsonb_build_object(''mime_type'',''image/jpeg'',''bytes'',10,''sha256'',repeat(''9'',64))))',
  :'c1',:'g1',:'floor'),array['22023'],'the same invoice number cannot be sent twice');
select test.expect_error(format('select public.submit_gang_invoice(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''team_id'',%L,
  ''lines'',jsonb_build_array(jsonb_build_object(''work_area_id'',%L,''quantity'',5)),''file'',jsonb_build_object(''mime_type'',''image/jpeg'',''bytes'',10,''sha256'',repeat(''8'',64))))',
  :'c1',:'g2',:'floor'),array['42501'],'a gang member cannot send an invoice for another gang');
select test.expect_error(format('select public.submit_gang_invoice(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''team_id'',%L,
  ''lines'',jsonb_build_array(jsonb_build_object(''work_area_id'',%L,''quantity'',0)),''file'',jsonb_build_object(''mime_type'',''image/jpeg'',''bytes'',10,''sha256'',repeat(''7'',64))))',
  :'c1',:'g1',:'floor'),array['22023'],'a claim needs a real quantity');
select test.assert((select count(*) from public.gang_invoice_commercials)=0,'a gang cannot read the money tables directly');

-- 2. The assigned supervisor automatically has exactly one check waiting; nobody had to create it.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'sam'),true);
select test.assert((select count(*) from public.gang_verification_requests where contract_id=:'c1' and resolved_at is null)=1
  and (select routed_to='supervisor' and assigned_supervisor_id=:'sam' from public.gang_verification_requests where invoice_id=:'inv1'),
  'the job''s supervisor sees one pending verification, routed to them');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'sue'),true);
select test.assert((select count(*) from public.gang_verification_requests)=0 and (select count(*) from public.gang_invoices)=0,
  'a supervisor on other jobs sees neither the request nor the invoice');

-- 10. Supervisors never reach money: tables, files, events, functions or storage.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'sam'),true);
select test.assert((select count(*) from public.gang_invoice_commercials)=0 and (select count(*) from public.gang_subcontracts)=0
  and (select count(*) from public.gang_rates)=0 and (select count(*) from public.gang_invoice_files where kind='invoice')=0
  and (select count(*) from public.job_cost_entries)=0 and (select count(*) from storage.objects where bucket_id='gang-claims')=0,
  'a supervisor cannot read invoice amounts, rates, terms, the invoice document or job costs');
select test.assert(public.my_gang_invoices()='[]'::jsonb,'a supervisor gets nothing from the gang''s own invoice function');
select test.expect_error(format('select public.decide_gang_invoice(gen_random_uuid(),%L,2,''approve'',''{}'')',:'inv1'),array['42501'],'a supervisor cannot approve money');
select test.expect_error(format('update public.gang_invoices set status=''approved'' where id=%L',:'inv1'),array['42501'],'a supervisor cannot change an invoice directly');

-- 3. The supervisor confirms only 50 m². They cannot verify work nobody has measured.
select id as line1 from public.gang_invoice_lines where invoice_id=:'inv1' \gset
select test.expect_error(format('select public.verify_gang_invoice(gen_random_uuid(),%L,2,jsonb_build_object(''lines'',jsonb_build_array(jsonb_build_object(''line_id'',%L,''verified_quantity'',50))))',:'inv1',:'line1'),
  array['22023'],'nothing can be verified until the work is measured and passed');
select test.expect_error(format('select public.verify_gang_invoice(gen_random_uuid(),%L,2,jsonb_build_object(''lines'',jsonb_build_array(jsonb_build_object(''line_id'',%L,''measured_passed'',60,''verified_quantity'',60))))',:'inv1',:'line1'),
  array['22023'],'the supervisor cannot verify more than the gang claimed');
select test.expect_error(format('select public.verify_gang_invoice(gen_random_uuid(),%L,1,''{"lines":[]}'')',:'inv1'),array['40001'],'a stale check is refused');
select public.verify_gang_invoice(gen_random_uuid(),:'inv1',2,jsonb_build_object('note','Measured with laser; 5 m² by the freezers not laid yet',
  'lines',jsonb_build_array(jsonb_build_object('line_id',:'line1','measured_passed',50,'verified_quantity',50))));
-- 5. The notification clears once properly verified.
select test.assert((select count(*) from public.gang_verification_requests where contract_id=:'c1' and resolved_at is null)=0
  and (select status from public.gang_invoices where id=:'inv1')='with_office',
  'after verification the request leaves the supervisor''s count and the invoice goes to the office');
select test.assert((select claimed_quantity=55 from public.gang_invoice_lines where id=:'line1'),'the gang''s original claim is untouched by the check');

-- 4. The office sees the 5 m² difference with the original claim and the money.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select test.assert((select claimed_quantity-verified_quantity from public.gang_invoice_lines where id=:'line1')=5
  and (select invoice_total from public.gang_invoice_commercials where invoice_id=:'inv1')=1017.5
  and (select count(*) from public.gang_invoice_files where invoice_id=:'inv1' and kind='invoice')=1,
  'the office sees claimed 55, verified 50, the 5 m² difference, the invoice amount and the document');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.assert((select count(*) from public.gang_invoice_commercials)=0,'an office user without money access sees no invoice amounts');
select test.expect_error(format('select public.decide_gang_invoice(gen_random_uuid(),%L,3,''approve'',''{}'')',:'inv1'),array['42501'],
  'an office user without money access cannot approve payment');

-- 6. The office approves the agreed amount; paying less than claimed needs a written reason.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select test.expect_error(format('select public.decide_gang_invoice(gen_random_uuid(),%L,3,''approve'',jsonb_build_object(''lines'',jsonb_build_array(jsonb_build_object(''line_id'',%L,''approved_quantity'',50,''rate'',18.5))))',:'inv1',:'line1'),
  array['22023'],'approving less than claimed without a reason is refused, never automatic');
select test.expect_error(format('select public.decide_gang_invoice(gen_random_uuid(),%L,3,''approve'',jsonb_build_object(''note'',''x y z'',''lines'',jsonb_build_array(jsonb_build_object(''line_id'',%L,''approved_quantity'',55,''rate'',18.5))))',:'inv1',:'line1'),
  array['22023'],'the office cannot approve more than the supervisor verified');
select public.decide_gang_invoice(gen_random_uuid(),:'inv1',3,'approve',jsonb_build_object('note','5 m² not yet laid by the freezers; claim it when complete',
  'lines',jsonb_build_array(jsonb_build_object('line_id',:'line1','approved_quantity',50,'rate',18.5))));
select test.assert((select status from public.gang_invoices where id=:'inv1')='approved'
  and (select approved_amount=925 and job_cost_entry_id is not null from public.gang_invoice_commercials where invoice_id=:'inv1')
  and (select net_amount=925 and category='subcontract' from public.job_cost_entries where request_key=:'inv1'),
  'approval records £925 (50 m² at £18.50) and the job cost');
select test.expect_error(format('select public.decide_gang_invoice(gen_random_uuid(),%L,4,''approve'',''{}'')',:'inv1'),array['22023'],'an approved invoice cannot be approved again');

-- 7. The same work cannot be paid twice. Measured and passed 80; approved 50; available 30; claim 35.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mark'),true);
select public.submit_gang_invoice(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','team_id',:'g1','invoice_number','INV-102',
  'lines',jsonb_build_array(jsonb_build_object('work_area_id',:'floor','unit','m2','quantity',35)),
  'file',jsonb_build_object('mime_type','image/jpeg','bytes',4096,'sha256',repeat('b',64)))) as inv2 \gset
select object_path as path2, id as file2 from public.gang_invoice_files where invoice_id=:'inv2' and kind='invoice' \gset
insert into storage.objects(bucket_id,name,metadata) values ('gang-claims',:'path2','{"size":4096,"mimetype":"image/jpeg"}');
select public.complete_gang_file(:'file2');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'sam'),true);
select id as line2 from public.gang_invoice_lines where invoice_id=:'inv2' \gset
select test.expect_error(format('select public.verify_gang_invoice(gen_random_uuid(),%L,2,jsonb_build_object(''lines'',jsonb_build_array(jsonb_build_object(''line_id'',%L,''verified_quantity'',5))))',:'inv2',:'line2'),
  array['22023'],'work already approved for payment cannot be verified again');
select public.record_gang_measurement(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','team_id',:'g1','work_area_id',:'floor','unit','m2','quantity',30,'quality_status','passed'));
select test.assert((select (x->>'passed')::numeric=80 and (x->>'approved')::numeric=50 and (x->>'available')::numeric=30
  from jsonb_array_elements(public.gang_claim_ledger(:'c1',:'g1')) x where x->>'work_area_id'=:'floor'),
  'the ledger shows 80 measured and passed, 50 approved, 30 remaining');
select test.assert(public.gang_claim_ledger(:'c1',:'g1')::text !~ '(rate|amount|total|£)','the supervisor''s ledger contains quantities only');
select test.expect_error(format('select public.verify_gang_invoice(gen_random_uuid(),%L,2,jsonb_build_object(''lines'',jsonb_build_array(jsonb_build_object(''line_id'',%L,''verified_quantity'',35))))',:'inv2',:'line2'),
  array['22023'],'a 35 m² claim cannot be verified beyond the 30 m² remaining');
select public.verify_gang_invoice(gen_random_uuid(),:'inv2',2,jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('line_id',:'line2','verified_quantity',30))));
select test.assert((select claimed_quantity-verified_quantity from public.gang_invoice_lines where id=:'line2')=5,'the 5 m² difference is kept for review');
select id as legacy from public.gang_progress_checks where contract_id=:'c1' and source_invoice_id=:'inv1' \gset
select test.expect_error(format('select public.void_gang_measurement(%L,''Entered against the wrong gang'')',:'legacy'),array['23514'],
  'a measurement already counted for payment cannot be voided');

-- 8. Several gangs at once; each sees only its own invoices.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'gina'),true);
select public.submit_gang_invoice(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','team_id',:'g2',
  'lines',jsonb_build_array(jsonb_build_object('work_area_id',:'entrance','unit','m2','quantity',20),jsonb_build_object('work_area_id',:'entrance','unit','lm','quantity',12)),
  'file',jsonb_build_object('mime_type','application/pdf','bytes',100,'sha256',repeat('c',64)))) as inv3 \gset
select object_path as path3, id as file3 from public.gang_invoice_files where invoice_id=:'inv3' and kind='invoice' \gset
insert into storage.objects(bucket_id,name,metadata) values ('gang-claims',:'path3','{"size":100,"mimetype":"application/pdf"}');
select public.complete_gang_file(:'file3');
select test.assert((select count(*) from public.gang_invoices)=1 and jsonb_array_length(public.my_gang_invoices())=1
  and (select count(*) from storage.objects where bucket_id='gang-claims')=1,
  'gang 2 sees only its own invoice and document');
select test.expect_error(format('select public.cancel_gang_invoice(%L,''not mine'')',:'inv1'),array['42501'],'a gang cannot touch another gang''s invoice');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert((select count(*) from public.gang_invoices where team_id=:'g2')=0 and (select count(*) from public.gang_invoice_lines where team_id=:'g2')=0,
  'gang 1 cannot see gang 2''s invoices');
select test.assert((select (x->>'approved_amount')::numeric=925 and x->>'status'='approved' and x->>'payment_due_on' is not null
  from jsonb_array_elements(public.my_gang_invoices()) x where x->>'id'=:'inv1'),'the gang sees its own approval, amount and payment date');
select test.assert(public.my_gang_invoices()::text !~ '(rate|job_cost|margin)','the gang sees no rates or job finances');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mark'),true);
select public.submit_gang_invoice(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','team_id',:'g1',
  'lines',jsonb_build_array(jsonb_build_object('work_area_id',:'entrance','unit','m2','quantity',8)),
  'file',jsonb_build_object('mime_type','image/png','bytes',300,'sha256',repeat('d',64)))) as inv4 \gset
select object_path as path4, id as file4 from public.gang_invoice_files where invoice_id=:'inv4' and kind='invoice' \gset
insert into storage.objects(bucket_id,name,metadata) values ('gang-claims',:'path4','{"size":300,"mimetype":"image/png"}');
select public.complete_gang_file(:'file4');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'sam'),true);
select test.assert((select count(*) from public.gang_verification_requests where contract_id=:'c1' and resolved_at is null)=2,
  'two gangs'' invoices waiting: the supervisor''s count is 2');

-- Corrections: defective work is never treated as passed until corrected and checked.
select id as line4 from public.gang_invoice_lines where invoice_id=:'inv4' \gset
select test.expect_error(format('select public.verify_gang_invoice(gen_random_uuid(),%L,2,jsonb_build_object(''lines'',jsonb_build_array(jsonb_build_object(''line_id'',%L,''measured_passed'',5,''measured_correction'',3,''verified_quantity'',5))))',:'inv4',:'line4'),
  array['22023'],'correction needed requires a description');
select public.verify_gang_invoice(gen_random_uuid(),:'inv4',2,jsonb_build_object('correction_note','Lippage at the door threshold; relay 3 m²',
  'lines',jsonb_build_array(jsonb_build_object('line_id',:'line4','measured_passed',5,'measured_correction',3,'verified_quantity',5))));
select test.assert((select workmanship='correction_needed' from public.gang_invoices where id=:'inv4')
  and (select line_quality='correction_required' and verified_quantity=5 from public.gang_invoice_lines where id=:'line4')
  and (select (x->>'correction')::numeric=3 and (x->>'available')::numeric=0 from jsonb_array_elements(public.gang_claim_ledger(:'c1',:'g1')) x
    where x->>'work_area_id'=:'entrance' and x->>'unit'='m2'),
  'work needing correction is recorded against the gang and location and is not eligible for payment');
select id as fix from public.gang_progress_checks where source_invoice_id=:'inv4' and quality_status='correction_required' \gset
select public.clear_gang_correction(:'fix','Relaid and checked with straight edge');
select test.assert((select (x->>'correction')::numeric=0 and (x->>'available')::numeric=3 from jsonb_array_elements(public.gang_claim_ledger(:'c1',:'g1')) x
    where x->>'work_area_id'=:'entrance' and x->>'unit'='m2')
  and (select quality_status='correction_required' and correction_cleared_at is not null from public.gang_progress_checks where id=:'fix'),
  'a correction completed and checked becomes passed; its history is kept');

-- Office decisions: query the gang, ask for a re-check, return for correction, resubmission, rejection, payment.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.decide_gang_invoice(gen_random_uuid(),:'inv2',3,'query_gang','{"note":"Which bays does the 35 m² cover?"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.answer_gang_query(:'inv2','Bays 4 to 7 by the chillers');
select test.assert((select status from public.gang_invoices where id=:'inv2')='with_office','the gang''s answer returns the invoice to the office');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.decide_gang_invoice(gen_random_uuid(),:'inv2',5,'recheck','{"note":"Please re-measure bays 4 to 7"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'sam'),true);
select test.assert((select count(*) from public.gang_verification_requests where invoice_id=:'inv2' and resolved_at is null and reason='office_recheck')=1
  and (select verified_quantity is null from public.gang_invoice_lines where id=:'line2'),
  'a re-check opens a new request for the supervisor; the earlier verification stays in the history');
select test.assert((select count(*) from public.gang_invoice_events where invoice_id=:'inv2' and action='verified')=1,'the earlier verification is kept in the history');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.decide_gang_invoice(gen_random_uuid(),:'inv2',6,'return','{"note":"Split the claim by bay and resend"}');
select test.assert((select count(*) from public.gang_verification_requests where invoice_id=:'inv2' and resolved_at is null)=0,
  'returning the invoice removes it from the supervisor''s count');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.submit_gang_invoice(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','team_id',:'g1','invoice_number','INV-102','replaces_invoice_id',:'inv2',
  'lines',jsonb_build_array(jsonb_build_object('work_area_id',:'floor','unit','m2','quantity',30)),
  'file',jsonb_build_object('mime_type','image/jpeg','bytes',4096,'sha256',repeat('b',64)))) as inv5 \gset
select test.assert((select status from public.gang_invoices where id=:'inv2')='returned','the returned invoice stays until its replacement is sent');
select object_path as path5, id as file5 from public.gang_invoice_files where invoice_id=:'inv5' and kind='invoice' \gset
insert into storage.objects(bucket_id,name,metadata) values ('gang-claims',:'path5','{"size":4096,"mimetype":"image/jpeg"}');
select public.complete_gang_file(:'file5');
select test.assert((select status='superseded' and superseded_by=:'inv5' from public.gang_invoices where id=:'inv2')
  and (select status from public.gang_invoices where id=:'inv5')='awaiting_check',
  'a corrected invoice replaces the returned one, which is kept as replaced');
select test.expect_error(format('select public.submit_gang_invoice(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''team_id'',%L,''replaces_invoice_id'',%L,
  ''lines'',jsonb_build_array(jsonb_build_object(''work_area_id'',%L,''quantity'',1)),''file'',jsonb_build_object(''mime_type'',''image/jpeg'',''bytes'',10,''sha256'',repeat(''6'',64))))',
  :'c1',:'g1',:'inv2',:'floor'),array['22023'],'a replaced invoice cannot be replaced again');
select public.cancel_gang_invoice(:'inv5','Sent by mistake');
select test.assert((select count(*) from public.gang_verification_requests where invoice_id=:'inv5' and resolved_at is null)=0,
  'a cancelled invoice leaves the supervisor''s count');
select test.expect_error(format('select public.cancel_gang_invoice(%L,''too late'')',:'inv1'),array['22023'],'an approved invoice cannot be withdrawn by the gang');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select test.expect_error(format('select public.decide_gang_invoice(gen_random_uuid(),%L,2,''reject'',''{"note":"no"}'')',:'inv3'),array['22023'],'a rejection needs a reason');
select public.decide_gang_invoice(gen_random_uuid(),:'inv3',2,'reject','{"note":"Not our contract scope; speak to the office"}');
select test.expect_error(format('select public.decide_gang_invoice(gen_random_uuid(),%L,3,''approve'',''{}'')',:'inv3'),array['22023'],'a rejected invoice cannot be approved');
select test.expect_error(format('select public.decide_gang_invoice(gen_random_uuid(),%L,4,''mark_paid'',jsonb_build_object(''paid_on'',(current_date+30)::text,''paid_amount'',740))',:'inv1'),
  array['22023'],'a payment cannot be recorded before it is made');
select public.decide_gang_invoice(gen_random_uuid(),:'inv1',4,'mark_paid',jsonb_build_object('paid_on',current_date::text,'paid_amount',740,'payment_reference','BACS 1113'));
select test.assert((select status from public.gang_invoices where id=:'inv1')='paid' and (select paid_amount=740 from public.gang_invoice_commercials where invoice_id=:'inv1'),
  'the office records the payment made (no bank payment is initiated)');
select test.expect_error(format('select public.decide_gang_invoice(gen_random_uuid(),%L,5,''mark_paid'',''{"paid_amount":740}'')',:'inv1'),array['22023'],'a payment is recorded once');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'sam'),true);
select test.assert((select count(*) from public.gang_invoice_events where invoice_id=:'inv1' and visibility='office')=0
  and (select count(*) from public.gang_invoice_events where invoice_id=:'inv1')>=4,
  'the supervisor sees the decisions on the invoice but not the money events');

-- 9. With no supervisor assigned the request goes to the office for allocation, then follows the assignment.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.submit_gang_invoice(gen_random_uuid(),jsonb_build_object('contract_id',:'c2','team_id',:'g1',
  'lines',jsonb_build_array(jsonb_build_object('work_area_id',:'hotel','unit','m2','quantity',12)),
  'file',jsonb_build_object('mime_type','application/pdf','bytes',50,'sha256',repeat('e',64)))) as inv6 \gset
select object_path as path6, id as file6 from public.gang_invoice_files where invoice_id=:'inv6' and kind='invoice' \gset
insert into storage.objects(bucket_id,name,metadata) values ('gang-claims',:'path6','{"size":50,"mimetype":"application/pdf"}');
select public.complete_gang_file(:'file6');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select test.assert((select routed_to='office' and assigned_supervisor_id is null from public.gang_verification_requests where invoice_id=:'inv6' and resolved_at is null),
  'with no supervisor on the job the request is routed to the office, not lost');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'sue'),true);
select test.assert((select count(*) from public.gang_verification_requests)=0,'an unassigned supervisor cannot see it');
reset role;
insert into public.contract_assignments(organisation_id,contract_id,user_id) values (:'org',:'c2',:'sue');
set local role authenticated;
select test.assert((select count(*) from public.gang_verification_requests where contract_id=:'c2' and resolved_at is null)=1,
  'once the office assigns a supervisor, the waiting check appears on their site');

-- Measurements are job-specific: the legacy screen still works for the assigned supervisor only.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'sam'),true);
insert into public.gang_progress_checks(organisation_id,contract_id,team_id,work_area_id,quantity_m2,quality_status,note,checked_by)
  values (:'org',:'c1',:'g2',:'entrance',4,'passed','',:'sam');
select test.assert((select unit='m2' and quantity=4 and measure_basis='incremental' from public.gang_progress_checks where team_id=:'g2'),
  'the original measurement screen records an incremental m² measurement');
select test.expect_error(format('insert into public.gang_progress_checks(organisation_id,contract_id,team_id,work_area_id,quantity_m2,quality_status,note,checked_by) values (%L,%L,%L,%L,4,''passed'','''',%L)',
  :'org',:'c2',:'g1',:'hotel',:'sam'),array['42501'],'a supervisor cannot record measurements on a job they are not assigned to');
select test.assert((select count(*) from public.gang_progress_checks where contract_id=:'c2')=0,'nor read them');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert((select count(*) from public.gang_progress_checks)=0 and (select count(*) from public.gang_verification_requests)=0,
  'gangs do not read supervisors'' measurements or verification requests');
select test.expect_error('select public.record_gang_measurement(gen_random_uuid(),''{}'')',array['22023','42501'],'a gang cannot record measurements');

-- Photos: gang evidence is visible to the site; the invoice document is not.
select public.reserve_gang_photo(gen_random_uuid(),:'inv6','{"mime_type":"image/jpeg","bytes":77,"sha256":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}') as photo \gset
select object_path as photo_path from public.gang_invoice_files where id=:'photo' \gset
insert into storage.objects(bucket_id,name,metadata) values ('gang-claims',:'photo_path','{"size":77,"mimetype":"image/jpeg"}');
select public.complete_gang_file(:'photo');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'sue'),true);
select test.assert((select count(*) from storage.objects where bucket_id='gang-claims')=1
  and (select count(*) from public.gang_invoice_files where kind='gang_photo')=1,
  'the supervisor sees the gang''s photo but never the invoice document');

-- Anonymous visitors see nothing and can call nothing.
reset role;
set local role anon;
select test.expect_error('select count(*) from public.gang_invoices',array['42501'],'anonymous visitors cannot read gang invoices');
select test.expect_error('select public.my_gang_invoices()',array['42501'],'anonymous visitors cannot call gang functions');

-- Recorded claims, measurements and history are permanent, even for trusted SQL.
reset role;
select test.expect_error(format('update public.gang_invoice_lines set claimed_quantity=1 where id=%L',:'line1'),array['42501'],'a claimed quantity cannot be rewritten');
select test.expect_error(format('update public.gang_invoice_lines set approved_quantity=1 where id=%L',:'line1'),array['42501'],'an approved quantity is final');
select test.expect_error(format('update public.gang_progress_checks set quantity=1 where id=%L',:'legacy'),array['42501'],'a measurement cannot be rewritten');
select test.expect_error('delete from public.gang_invoice_events',array['42501'],'invoice history cannot be deleted');
select test.expect_error(format('update public.gang_invoice_commercials set invoice_total=1 where invoice_id=%L',:'inv1'),array['42501'],'the amount the gang invoiced cannot be rewritten');
select test.expect_error(format('update public.gang_invoices set status=''approved'' where id=%L',:'inv3'),array['42501'],'a rejected invoice cannot be reopened');
select test.expect_error(format('delete from public.gang_invoices where id=%L',:'inv1'),array['42501'],'an invoice cannot be deleted');
select test.assert((select count(*) from public.audit_events where entity_type='gang_invoice_commercials' and commercial)>0
  and (select count(*) from public.audit_events where entity_type='gang_invoice_commercials' and not commercial)=0,
  'money changes are audited as commercial records');
rollback;
