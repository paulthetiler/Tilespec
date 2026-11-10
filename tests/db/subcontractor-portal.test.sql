-- Subcontractor portal: onboard -> agreement -> link -> sign -> allocate and rate -> invoice (generated and
-- uploaded) -> supervisor verification -> office approval with CIS and retention -> payment. Disposable database only.
begin;
\set owner 'a7000000-0000-4000-8000-000000000001'
\set faye 'a7000000-0000-4000-8000-000000000002'
\set mia 'a7000000-0000-4000-8000-000000000003'
\set sam 'a7000000-0000-4000-8000-000000000004'
\set org 'a7100000-0000-4000-8000-000000000001'
\set c1 'a7200000-0000-4000-8000-000000000001'
\set floor 'a7300000-0000-4000-8000-000000000001'
\set entrance 'a7300000-0000-4000-8000-000000000002'
\set g1 'a7400000-0000-4000-8000-000000000001'
\set g2 'a7400000-0000-4000-8000-000000000002'
\set expired 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
insert into auth.users(id,email) select id::uuid,id||'@example.invalid' from unnest(array[:'owner',:'faye',:'mia',:'sam']) id;
insert into public.organisations(id,name) values (:'org','Portal test contractor');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access)
select :'org',id::uuid,name,role::public.operations_role,money from (values
 (:'owner','Olive Owner','owner',true),(:'faye','Faye Finance','contracts_manager',true),(:'mia','Mia Manager','contracts_manager',false),
 (:'sam','Sam Supervisor','supervisor',false)) p(id,name,role,money);
insert into public.contracts(id,organisation_id,reference,name,created_by) values (:'c1',:'org','SM-1','Supermarket refurbishment',:'owner');
insert into public.work_areas(id,organisation_id,contract_id,name,created_by) values
 (:'floor',:'org',:'c1','Main shop floor',:'owner'),(:'entrance',:'org',:'c1','Entrance',:'owner');
insert into public.contract_assignments(organisation_id,contract_id,user_id) values (:'org',:'c1',:'sam'),(:'org',:'c1',:'faye'),(:'org',:'c1',:'mia');
insert into public.teams(id,organisation_id,name,kind) values (:'g1',:'org','Dave Tiling','individual_subcontractor'),(:'g2',:'org','Gina Ceramics Ltd','subcontract_gang');

-- 1. Onboarding: only money-access office users record tax and bank details.
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.expect_error(format('select public.save_subcontractor_profile(%L,null,jsonb_build_object(''legal_name'',''Dave Tiler'',''address'',''1 High Street, Warrington''))',:'g1'),
  array['42501'],'an office user without money access cannot record a subcontractor''s tax details');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select test.expect_error(format('select public.save_subcontractor_profile(%L,null,jsonb_build_object(''legal_name'',''Dave Tiler'',''address'',''1 High Street, Warrington'',''cis_status'',''net''))',:'g1'),
  array['22023'],'a CIS status cannot be recorded without the date it was verified with HMRC');
select public.save_subcontractor_profile(:'g1',null,jsonb_build_object('legal_name','Dave Tiler','trading_name','Dave Tiling','address','1 High Street, Warrington','utr','1234567890'));
select test.expect_error(format('select public.save_subcontractor_profile(%L,7,jsonb_build_object(''legal_name'',''Dave Tiler'',''address'',''2 High Street, Warrington''))',:'g1'),
  array['40001'],'stale tax details cannot overwrite newer ones');
select public.save_subcontractor_bank(:'g1',jsonb_build_object('account_name','D Tiler','sort_code','12-34-56','account_number','12345678'));
select test.assert((select sort_code='12-34-56' and account_number='12345678' from public.subcontractor_bank_details where team_id=:'g1'),'money-access office users can read bank details');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'sam'),true);
select test.assert((select count(*) from public.subcontractor_bank_details)=0 and (select count(*) from public.subcontractor_tax_profiles)=0,
  'a supervisor cannot read bank or tax details');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.assert((select count(*) from public.subcontractor_bank_details)=0 and (select count(*) from public.subcontractor_tax_profiles)=0,
  'an office user without money access cannot read bank or tax details');
reset role;
select test.assert((select count(*) from public.audit_events where entity_type='subcontractor_bank_details' and details::text like '%12345678%')=0,
  'bank account numbers are never copied into the audit log');

-- 2. The agreement: a version cannot be issued until the owner records its legal review.
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.create_agreement_version(jsonb_build_object('version_label','1.0','title','Subcontract agreement','body',repeat('The Subcontractor shall carry out the Works with reasonable skill and care. ',20))) as v1 \gset
select test.expect_error(format('select public.issue_subcontractor_agreement(%L,%L)',:'g1',:'v1'),array['22023'],'a draft agreement cannot be issued');
select test.expect_error(format('select public.publish_agreement_version(%L,jsonb_build_object(''legal_reviewed_by'',''A Solicitor'',''legal_reviewed_on'',current_date::text))',:'v1'),
  array['42501'],'only the owner can publish an agreement');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select test.expect_error(format('select public.publish_agreement_version(%L,''{}'')',:'v1'),array['22023'],'an agreement cannot be published without its legal review on record');
select public.publish_agreement_version(:'v1',jsonb_build_object('legal_reviewed_by','A Solicitor, Example LLP','legal_reviewed_on',current_date::text));
select test.expect_error(format('update public.subcontractor_agreement_versions set body=body||''x'' where id=%L',:'v1'),array['42501'],'the text of a published agreement cannot be changed');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.issue_subcontractor_agreement(:'g1',:'v1') as a1 \gset

-- 3. Access links: issued by money access only; the secret is returned once and only its hash is stored.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.expect_error(format('select public.issue_portal_link(%L,jsonb_build_object(''issued_to'',''Dave Tiler''))',:'g1'),array['42501'],'an office user without money access cannot issue a link');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.issue_portal_link(:'g1',jsonb_build_object('issued_to','Dave Tiler','days',14))->>'token' as t1 \gset
select test.expect_error('select token_sha256 from public.subcontractor_portal_links',array['42501'],'even the office cannot read a link''s fingerprint');
reset role;
select test.assert((select count(*)=1 and bool_and(token_sha256<>:'t1' and token_sha256=encode(sha256(convert_to(:'t1','UTF8')),'hex')) from public.subcontractor_portal_links),
  'only the SHA-256 of the link secret is stored');
insert into public.subcontractor_portal_links(organisation_id,team_id,token_sha256,issued_to,expires_at,created_by,created_by_name,created_at)
  values (:'org',:'g1',encode(sha256(convert_to(:'expired','UTF8')),'hex'),'Dave Tiler',now()-interval '1 day',:'faye','Faye Finance',now()-interval '10 days');

set local role anon;
select set_config('request.jwt.claims','',true);
select test.expect_error('select public.portal_session(''not-a-token'')',array['42501'],'a malformed link is refused');
select test.expect_error(format('select public.portal_session(%L)',repeat('0',64)),array['42501'],'a guessed link is refused');
select test.expect_error(format('select public.portal_session(%L)',:'expired'),array['42501'],'an expired link is refused');
select test.expect_error('select count(*) from public.gang_invoices',array['42501'],'an anonymous visitor cannot read invoices directly');
select test.expect_error('select count(*) from public.subcontractor_tax_profiles',array['42501'],'an anonymous visitor cannot read subcontractor records directly');
select test.expect_error('select count(*) from public.teams',array['42501'],'an anonymous visitor cannot list subcontractors');
select test.assert((public.portal_session(:'t1')->>'agreement_signed')::boolean = false and public.portal_session(:'t1')#>>'{agreement,status}'='issued'
  and public.portal_session(:'t1')::text not like '%12345678%' and public.portal_session(:'t1')::text not like '%12-34-56%'
  and public.portal_session(:'t1')#>>'{subcontractor,bank_ending}'='5678',
  'the link shows the agreement waiting for signature and never the bank account number or sort code');

-- 4. Signing. An unsigned agreement is never treated as accepted.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.save_gang_subcontract(jsonb_build_object('contract_id',:'c1','team_id',:'g1','payment_cycle','weekly','pay_weekday',5,'payment_days',7,'retention_percent',5)) as s1 \gset
select public.save_gang_rate(gen_random_uuid(),jsonb_build_object('subcontract_id',:'s1','unit','m2','rate',20,'effective_from','2026-01-01'));
select public.save_gang_rate(gen_random_uuid(),jsonb_build_object('subcontract_id',:'s1','unit','day','rate',180,'description','Tiler day rate','effective_from','2026-01-01')) as dayrate \gset
select test.expect_error(format('select public.save_gang_rate(gen_random_uuid(),jsonb_build_object(''subcontract_id'',%L,''unit'',''day'',''rate'',180,''work_area_id'',%L))',:'s1',:'floor'),
  array['22023'],'a day rate applies across the job, not to one area');
select public.save_gang_variation(gen_random_uuid(),jsonb_build_object('subcontract_id',:'s1','description','Extra skirting to the cafe','amount',500)) as var1 \gset
reset role;
set local role anon;
select set_config('request.jwt.claims','',true);
select jsonb_build_object('contract_id',:'c1','invoice_number','0001','lines',jsonb_build_array(jsonb_build_object('work_area_id',:'floor','unit','m2','quantity',50)),
  'day_rates',jsonb_build_array(jsonb_build_object('rate_id',:'dayrate','quantity',2,'description','Making good around the tills')),
  'variations',jsonb_build_array(jsonb_build_object('variation_id',:'var1','amount',300)),
  'additional',jsonb_build_array(jsonb_build_object('description','Moved pallets for the electricians, asked by site manager','amount',120)))::text as claim1 \gset
select test.expect_error(format('select public.portal_prepare_invoice(%L,gen_random_uuid(),%L::jsonb)',:'t1',:'claim1'),array['42501'],
  'an invoice cannot be sent before the agreement is signed');
select public.portal_agreement(:'t1')->>'body_sha256' as sha1 \gset
select test.expect_error(format('select public.portal_sign_agreement(%L,%L,jsonb_build_object(''body_sha256'',%L,''signer_name'',''Dave Tiler'',''signature_text'',''Dave Tiler'',
  ''confirm_read'',true,''confirm_authority'',true,''confirm_electronic'',true))',:'t1',:'a1',repeat('0',64)),array['40001'],'signing must quote the exact text that was shown');
select test.expect_error(format('select public.portal_sign_agreement(%L,%L,jsonb_build_object(''body_sha256'',%L,''signer_name'',''Dave Tiler'',''signature_text'',''Dave Tiler'',
  ''confirm_read'',true,''confirm_authority'',false,''confirm_electronic'',true))',:'t1',:'a1',:'sha1'),array['22023'],'every statement must be confirmed to sign');
select test.expect_error(format('select public.portal_sign_agreement(%L,%L,jsonb_build_object(''body_sha256'',%L,''signer_name'',''Dave Tiler'',''signature_text'',''D'',
  ''confirm_read'',true,''confirm_authority'',true,''confirm_electronic'',true))',:'t1',:'a1',:'sha1'),array['22023'],'the typed signature must match the signer''s name');
select public.portal_sign_agreement(:'t1',:'a1',jsonb_build_object('body_sha256',:'sha1','signer_name','Dave Tiler','signer_position','Proprietor','signature_text','dave  tiler',
  'confirm_read',true,'confirm_authority',true,'confirm_electronic',true,'ip','203.0.113.9','user_agent','Test browser'));
select test.expect_error(format('select public.portal_sign_agreement(%L,%L,jsonb_build_object(''body_sha256'',%L,''signer_name'',''Dave Tiler'',''signature_text'',''Dave Tiler'',
  ''confirm_read'',true,''confirm_authority'',true,''confirm_electronic'',true))',:'t1',:'a1',:'sha1'),array['22023'],'an agreement cannot be signed twice');
reset role;
select test.assert((select status='signed' and signed_at is not null and signer_name='Dave Tiler' and signer_ip='203.0.113.9' and version_label='1.0'
  and body_sha256=:'sha1' and evidence_sha256 ~ '^[0-9a-f]{64}$' and signed_link_id is not null from public.subcontractor_agreements where id=:'a1'),
  'the signed agreement keeps its exact version, signer, time, link, address and evidence fingerprint');
select test.expect_error(format('update public.subcontractor_agreements set signer_name=''Someone Else'' where id=%L',:'a1'),array['42501'],'a signature is permanent');
select test.expect_error(format('update public.subcontractor_agreements set body=''changed'' where id=%L',:'a1'),array['42501'],'a signed agreement''s text cannot be rewritten');

-- 5. The subcontractor sees their own job, agreed rates, day rates and approved variations.
set local role anon;
select set_config('request.jwt.claims','',true);
select test.assert(jsonb_array_length(public.portal_session(:'t1')->'jobs')=1 and (public.portal_session(:'t1')#>>'{jobs,0,areas,0,rates,m2}')::numeric=20
  and (public.portal_session(:'t1')#>>'{jobs,0,day_rates,0,rate}')::numeric=180 and (public.portal_session(:'t1')#>>'{jobs,0,variations,0,remaining}')::numeric=500
  and (public.portal_session(:'t1')#>>'{generator,allowed}')::boolean,
  'the link already knows the allocated job, agreed rates, day rates and approved variations');

-- 6. Generating an invoice: quantities only. Rates and totals come from the office''s records.
select test.assert((public.portal_preview_invoice(:'t1',:'claim1'::jsonb)#>>'{totals,net}')::numeric=1780
  and (public.portal_preview_invoice(:'t1',:'claim1'::jsonb)#>>'{totals,gross}')::numeric=1780
  and (public.portal_preview_invoice(:'t1',:'claim1'::jsonb)#>>'{estimate,retention}')::numeric=89
  and public.portal_preview_invoice(:'t1',:'claim1'::jsonb)#>>'{estimate,cis}' is null,
  'the preview prices 50 m2, two days, a variation and additional work at agreed rates, and gives no CIS figure before HMRC verification');
select test.expect_error(format('select public.portal_preview_invoice(%L,jsonb_build_object(''contract_id'',%L,''invoice_number'',''X'',''lines'',jsonb_build_array(
  jsonb_build_object(''work_area_id'',%L,''quantity'',50,''rate'',99))))',:'t1',:'c1',:'floor'),array['22023'],'a subcontractor cannot supply or alter a rate');
select test.expect_error(format('select public.portal_preview_invoice(%L,jsonb_build_object(''contract_id'',%L,''invoice_number'',''X'',''invoice_total'',9999,''lines'',jsonb_build_array(
  jsonb_build_object(''work_area_id'',%L,''quantity'',50))))',:'t1',:'c1',:'floor'),array['22023'],'a generated invoice''s total cannot be entered');
select test.expect_error(format('select public.portal_preview_invoice(%L,jsonb_build_object(''contract_id'',%L,''invoice_number'',''X'',''variations'',jsonb_build_array(
  jsonb_build_object(''variation_id'',%L,''amount'',501))))',:'t1',:'c1',:'var1'),array['22023'],'a variation cannot be claimed beyond its agreed sum');
select test.expect_error(format('select public.portal_preview_invoice(%L,jsonb_build_object(''contract_id'',%L,''invoice_number'',''X''))',:'t1',:'c1'),array['22023'],'an invoice must be for some work');
select gen_random_uuid() as key1 \gset
select public.portal_prepare_invoice(:'t1',:'key1',:'claim1'::jsonb)->>'invoice_id' as inv1 \gset
select test.assert(public.portal_prepare_invoice(:'t1',:'key1',:'claim1'::jsonb)->>'invoice_id'=:'inv1','a retried submission returns the same invoice');
select public.portal_reserve_file(:'t1',gen_random_uuid(),:'inv1','invoice',jsonb_build_object('mime_type','application/pdf','bytes',2048,'sha256',repeat('a',64))) as file1 \gset
select :'file1'::jsonb->>'file_id' as file1id, :'file1'::jsonb->>'object_path' as path1 \gset
select test.expect_error(format('select public.portal_complete_file(%L,%L)',:'t1',:'file1id'),array['22023'],'an invoice is not sent before its document is stored');
select test.expect_error('insert into storage.objects(bucket_id,name,metadata) values (''gang-claims'',''somewhere/else.pdf'',''{"size":2048,"mimetype":"application/pdf"}'')',
  array['42501'],'a link holder cannot store a file anywhere but the reserved path');
select test.expect_error(format('select public.portal_reserve_file(%L,gen_random_uuid(),%L,''invoice'',jsonb_build_object(''mime_type'',''image/svg+xml'',''bytes'',10,''sha256'',repeat(''b'',64)))',:'t1',:'inv1'),
  array['22023'],'only PDF, JPEG and PNG files are accepted');
insert into storage.objects(bucket_id,name,metadata) values ('gang-claims',:'path1','{"size":2048,"mimetype":"application/pdf"}');
select test.assert((select count(*) from storage.objects where bucket_id='gang-claims')=0,'a link holder can never read stored files back');
select test.assert(public.portal_complete_file(:'t1',:'file1id')->>'status'='awaiting_check','storing the document sends the invoice for checking, not for payment');
reset role;
select test.assert((select status='awaiting_check' and source='generated' and submitted_by is null and portal_link_id is not null and submitted_by_name='Dave Tiler'
    from public.gang_invoices where id=:'inv1')
  and (select count(*)=1 and bool_and(routed_to='supervisor') from public.gang_verification_requests where invoice_id=:'inv1' and resolved_at is null)
  and (select approved_amount is null and approved_at is null and invoice_total=1780 from public.gang_invoice_commercials where invoice_id=:'inv1'),
  'a submitted invoice is recorded against the link, opens one supervisor check and is not approved');

-- 7. Duplicates are refused: the same number, the same work while it is open, the same document, an over-claimed variation.
set local role anon;
select set_config('request.jwt.claims','',true);
select test.expect_error(format('select public.portal_prepare_invoice(%L,gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''invoice_number'',''0001'',''lines'',jsonb_build_array(
  jsonb_build_object(''work_area_id'',%L,''quantity'',5))))',:'t1',:'c1',:'entrance'),array['22023'],'the same invoice number cannot be sent twice');
select test.expect_error(format('select public.portal_prepare_invoice(%L,gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''invoice_number'',''0002'',''lines'',jsonb_build_array(
  jsonb_build_object(''work_area_id'',%L,''quantity'',50))))',:'t1',:'c1',:'floor'),array['22023'],'the same work area cannot be claimed again while its claim is open');
select test.expect_error(format('select public.portal_prepare_invoice(%L,gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''invoice_number'',''0002'',''variations'',jsonb_build_array(
  jsonb_build_object(''variation_id'',%L,''amount'',250))))',:'t1',:'c1',:'var1'),array['22023'],'a variation already part-claimed cannot be claimed beyond what is left');
-- An uploaded invoice: project, number, date and amount are required, and it joins the same approval process.
select test.expect_error(format('select public.portal_prepare_invoice(%L,gen_random_uuid(),jsonb_build_object(''mode'',''upload'',''contract_id'',%L,''invoice_number'',''DT-77'',''lines'',jsonb_build_array(
  jsonb_build_object(''work_area_id'',%L,''quantity'',10))))',:'t1',:'c1',:'entrance'),array['22023'],'an uploaded invoice needs its claimed amount');
select public.portal_prepare_invoice(:'t1',gen_random_uuid(),jsonb_build_object('mode','upload','contract_id',:'c1','invoice_number','DT-77','invoice_date',current_date::text,'invoice_total',230,
  'lines',jsonb_build_array(jsonb_build_object('work_area_id',:'entrance','quantity',10))))->>'invoice_id' as inv2 \gset
select test.expect_error(format('select public.portal_reserve_file(%L,gen_random_uuid(),%L,''invoice'',jsonb_build_object(''mime_type'',''application/pdf'',''bytes'',2048,''sha256'',repeat(''a'',64)))',:'t1',:'inv2'),
  array['22023'],'the same invoice document cannot be sent twice');
select public.portal_reserve_file(:'t1',gen_random_uuid(),:'inv2','invoice',jsonb_build_object('mime_type','image/jpeg','bytes',900,'sha256',repeat('c',64))) as file2 \gset
insert into storage.objects(bucket_id,name,metadata) values ('gang-claims',:'file2'::jsonb->>'object_path','{"size":900,"mimetype":"image/jpeg"}');
select public.portal_complete_file(:'t1',(:'file2'::jsonb->>'file_id')::uuid);
select public.portal_reserve_file(:'t1',gen_random_uuid(),:'inv1','photo',jsonb_build_object('mime_type','image/png','bytes',500,'sha256',repeat('d',64))) as photo1 \gset
insert into storage.objects(bucket_id,name,metadata) values ('gang-claims',:'photo1'::jsonb->>'object_path','{"size":500,"mimetype":"image/png"}');
select public.portal_complete_file(:'t1',(:'photo1'::jsonb->>'file_id')::uuid);
reset role;
select test.assert((select status='awaiting_check' and source='upload' from public.gang_invoices where id=:'inv2')
  and (select count(*)=1 from public.gang_invoice_files where invoice_id=:'inv1' and kind='gang_photo' and uploaded_at is not null),
  'an uploaded invoice joins the same approval process, and supporting photographs are kept with the claim');
select id as line1 from public.gang_invoice_lines where invoice_id=:'inv1' \gset
select id as line2 from public.gang_invoice_lines where invoice_id=:'inv2' \gset
select id as xday from public.gang_invoice_extras where invoice_id=:'inv1' and kind='day_rate' \gset
select id as xvar from public.gang_invoice_extras where invoice_id=:'inv1' and kind='variation' \gset
select id as xadd from public.gang_invoice_extras where invoice_id=:'inv1' and kind='additional' \gset

-- 8. The supervisor confirms quantities and completion, never money, and cannot authorise payment.
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'sam'),true);
select test.assert((select count(*) from public.gang_invoice_extras)=0 and (select count(*) from public.gang_variations)=0 and (select count(*) from public.gang_invoice_commercials)=0,
  'a supervisor cannot read extras amounts, variation sums or invoice money');
select test.assert(jsonb_array_length(public.gang_invoice_extras_for_check(:'inv1'))=3 and public.gang_invoice_extras_for_check(:'inv1')::text not like '%amount%'
  and public.gang_invoice_extras_for_check(:'inv1')::text not like '%"rate"%','the supervisor sees the extras to confirm with no rates or amounts');
select test.expect_error(format('select public.verify_gang_invoice(gen_random_uuid(),%L,2,jsonb_build_object(''lines'',jsonb_build_array(jsonb_build_object(''line_id'',%L,''measured_passed'',45,''verified_quantity'',45))))',:'inv1',:'line1'),
  array['22023'],'every extra item must be confirmed by the supervisor');
select test.expect_error(format('select public.verify_gang_invoice(gen_random_uuid(),%L,2,jsonb_build_object(''lines'',jsonb_build_array(jsonb_build_object(''line_id'',%L,''measured_passed'',45,''verified_quantity'',45)),
  ''extras'',jsonb_build_array(jsonb_build_object(''extra_id'',%L,''confirmed_quantity'',2),jsonb_build_object(''extra_id'',%L,''confirmed_quantity'',1),jsonb_build_object(''extra_id'',%L,''confirmed_quantity'',0))))',
  :'inv1',:'line1',:'xday',:'xvar',:'xadd'),array['22023'],'confirming less than claimed needs the supervisor''s reason');
select public.verify_gang_invoice(gen_random_uuid(),:'inv1',2,jsonb_build_object('note','45 m2 laid; 5 m2 by the freezers not done',
  'lines',jsonb_build_array(jsonb_build_object('line_id',:'line1','measured_passed',45,'verified_quantity',45)),
  'extras',jsonb_build_array(jsonb_build_object('extra_id',:'xday','confirmed_quantity',2),jsonb_build_object('extra_id',:'xvar','confirmed_quantity',1),
    jsonb_build_object('extra_id',:'xadd','confirmed_quantity',0,'note','Not instructed by TileSpec'))));
select test.expect_error(format('select public.decide_gang_invoice(gen_random_uuid(),%L,3,''approve'',''{"lines":[]}'')',:'inv1'),array['42501'],'a supervisor cannot authorise payment');
reset role;
select test.assert((select status='with_office' from public.gang_invoices where id=:'inv1') and (select approved_at is null from public.gang_invoice_commercials where invoice_id=:'inv1'),
  'supervisor verification sends the invoice to the office without approving any money');

-- 9. Accounts approval. No deduction without a recorded basis; disputed quantities need a written reason.
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select jsonb_build_object('note','5 m2 not laid; pallet moving was not instructed','lines',jsonb_build_array(jsonb_build_object('line_id',:'line1','approved_quantity',45,'rate',20)),
  'extras',jsonb_build_array(jsonb_build_object('extra_id',:'xday','approved_amount',360),jsonb_build_object('extra_id',:'xvar','approved_amount',300),
    jsonb_build_object('extra_id',:'xadd','approved_amount',0)))::text as approve1 \gset
select test.expect_error(format('select public.decide_gang_invoice(gen_random_uuid(),%L,3,''approve'',%L::jsonb)',:'inv1',:'approve1'),array['22023'],
  'payment cannot be approved until the CIS status is verified with HMRC');
select public.save_subcontractor_profile(:'g1',1,jsonb_build_object('legal_name','Dave Tiler','trading_name','Dave Tiling','address','1 High Street, Warrington','utr','1234567890',
  'cis_status','net','cis_verification_number','V1234567890','cis_verified_on',current_date::text));
select test.expect_error(format('select public.decide_gang_invoice(gen_random_uuid(),%L,3,''approve'',(%L::jsonb - ''note''))',:'inv1',:'approve1'),array['22023'],
  'approving less than claimed needs a written reason');
select test.expect_error(format('select public.decide_gang_invoice(gen_random_uuid(),%L,3,''approve'',jsonb_set(%L::jsonb,''{extras,2,approved_amount}'',''120''))',:'inv1',:'approve1'),array['22023'],
  'work the supervisor did not confirm cannot be approved for payment');
select test.expect_error(format('select public.decide_gang_invoice(gen_random_uuid(),%L,3,''approve'',jsonb_set(%L::jsonb,''{lines,0,approved_quantity}'',''50''))',:'inv1',:'approve1'),array['22023'],
  'the office cannot approve more than the supervisor verified');
select public.decide_gang_invoice(gen_random_uuid(),:'inv1',3,'approve',:'approve1'::jsonb);
select test.assert((select approved_amount=1560 and retention_percent=5 and retention_amount=78 and cis_rate=20 and cis_materials=0 and cis_amount=296.40
    and vat_treatment='none' and vat_amount=0 and net_payable=1185.60 and invoice_total=1780 from public.gang_invoice_commercials where invoice_id=:'inv1'),
  'approval works out retention (5%) and CIS (20% of the labour paid) and keeps the gross invoice value separate: 1,560.00 approved, 1,185.60 payable');
select test.assert((select count(*)=1 and sum(net_amount)=1560 from public.job_cost_entries where contract_id=:'c1' and category='subcontract'),
  'the approved value, before deductions, is the job''s subcontract cost');
select test.expect_error(format('update public.gang_invoice_commercials set cis_amount=0 where invoice_id=%L',:'inv1'),array['42501'],'an approved payment calculation cannot be rewritten');
select public.decide_gang_invoice(gen_random_uuid(),:'inv1',4,'mark_paid',jsonb_build_object('paid_amount',1185.60,'payment_reference','BACS 1'));
select test.assert((select status='paid' from public.gang_invoices where id=:'inv1'),'payment is recorded by the office after approval');

-- 10. Retention held is released later, never more than is held, less CIS.
select test.expect_error(format('select public.release_gang_retention(gen_random_uuid(),jsonb_build_object(''subcontract_id'',%L,''amount'',100))',:'s1'),array['22023'],'more retention than is held cannot be released');
select public.release_gang_retention(gen_random_uuid(),jsonb_build_object('subcontract_id',:'s1','amount',78,'payment_reference','BACS 2'));
select test.assert((select amount=78 and cis_amount=15.60 and net_paid=62.40 from public.gang_retention_releases where subcontract_id=:'s1'),'released retention is paid less CIS at the verified rate');
reset role;
select test.assert(private.gang_retention_held(:'s1')=0,'no retention remains held after it is released');

-- 11. Returned, corrected and rejected invoices.
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.decide_gang_invoice(gen_random_uuid(),:'inv2',2,'return',jsonb_build_object('note','The amount does not match your agreed rate'));
reset role;
set local role anon;
select set_config('request.jwt.claims','',true);
select test.assert((select x->>'status' from jsonb_array_elements(public.portal_session(:'t1')->'invoices') x where x->>'id'=:'inv2')='returned'
  and (select x#>>'{payment,payable}' from jsonb_array_elements(public.portal_session(:'t1')->'invoices') x where x->>'id'=:'inv1')::numeric=1185.60,
  'the subcontractor sees the returned invoice and the payment worked out on the paid one');
select public.portal_prepare_invoice(:'t1',gen_random_uuid(),jsonb_build_object('mode','upload','contract_id',:'c1','invoice_number','DT-77','invoice_total',200,'replaces_invoice_id',:'inv2',
  'lines',jsonb_build_array(jsonb_build_object('work_area_id',:'entrance','quantity',10))))->>'invoice_id' as inv3 \gset
select public.portal_reserve_file(:'t1',gen_random_uuid(),:'inv3','invoice',jsonb_build_object('mime_type','application/pdf','bytes',700,'sha256',repeat('e',64))) as file3 \gset
insert into storage.objects(bucket_id,name,metadata) values ('gang-claims',:'file3'::jsonb->>'object_path','{"size":700,"mimetype":"application/pdf"}');
select public.portal_complete_file(:'t1',(:'file3'::jsonb->>'file_id')::uuid);
reset role;
select test.assert((select status='superseded' from public.gang_invoices where id=:'inv2') and (select status='awaiting_check' and replaces_invoice_id=:'inv2' from public.gang_invoices where id=:'inv3'),
  'a corrected invoice replaces the returned one, which is kept');
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.decide_gang_invoice(gen_random_uuid(),:'inv3',2,'reject',jsonb_build_object('note','Entrance was tiled by another gang'));
reset role;
select test.assert((select status='rejected' from public.gang_invoices where id=:'inv3') and (select approved_at is null from public.gang_invoice_commercials where invoice_id=:'inv3')
  and (select count(*) from public.gang_invoice_events where invoice_id in (:'inv1',:'inv2',:'inv3'))>=12,
  'a rejected invoice is never approved, and every step is in the invoice history');

-- 12. One subcontractor can never reach another's records; a revoked link stops working at once.
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.save_subcontractor_profile(:'g2',null,jsonb_build_object('business_type','limited_company','legal_name','Gina Ceramics Ltd','address','5 Mill Lane, Warrington',
  'cis_status','gross','cis_verified_on',current_date::text,'vat_registered',true,'vat_number','123456789'));
select public.issue_subcontractor_agreement(:'g2',:'v1') as a2 \gset
select public.issue_portal_link(:'g2',jsonb_build_object('issued_to','Gina Potter'))->>'token' as t2 \gset
select public.save_gang_subcontract(jsonb_build_object('contract_id',:'c1','team_id',:'g2')) as s2 \gset
select public.save_gang_rate(gen_random_uuid(),jsonb_build_object('subcontract_id',:'s2','unit','m2','rate',25,'effective_from','2026-01-01'));
reset role;
set local role anon;
select set_config('request.jwt.claims','',true);
select test.assert(public.portal_invoice(:'t2',:'inv1') is null and jsonb_array_length(public.portal_session(:'t2')->'invoices')=0
  and public.portal_session(:'t2')::text not like '%Dave%' and (public.portal_session(:'t2')#>>'{jobs,0,areas,0,rates,m2}')::numeric=25,
  'another subcontractor''s link shows none of this subcontractor''s invoices, name or rates');
select test.expect_error(format('select public.portal_cancel_invoice(%L,%L,''x'')',:'t2',:'inv3'),array['42501'],'another subcontractor''s link cannot withdraw this invoice');
select test.expect_error(format('select public.portal_reserve_file(%L,gen_random_uuid(),%L,''photo'',jsonb_build_object(''mime_type'',''image/png'',''bytes'',5,''sha256'',repeat(''f'',64)))',:'t2',:'inv1'),
  array['42501'],'another subcontractor''s link cannot add files to this invoice');
select test.expect_error(format('select public.portal_sign_agreement(%L,%L,''{}'')',:'t2',:'a1'),array['42501','22023'],'another subcontractor''s link cannot sign this agreement');

-- 13. VAT self-billing control: a VAT-registered subcontractor cannot generate invoices here without an agreement in force.
select public.portal_agreement(:'t2')->>'body_sha256' as sha2 \gset
select public.portal_sign_agreement(:'t2',:'a2',jsonb_build_object('body_sha256',:'sha2','signer_name','Gina Potter','signature_text','Gina Potter','signer_position','Director',
  'confirm_read',true,'confirm_authority',true,'confirm_electronic',true));
select jsonb_build_object('contract_id',:'c1','invoice_number','G-1','lines',jsonb_build_array(jsonb_build_object('work_area_id',:'floor','quantity',10)))::text as claim2 \gset
select test.assert(not (public.portal_session(:'t2')#>>'{generator,allowed}')::boolean,'the generator is switched off for a VAT-registered subcontractor with no self-billing agreement');
select test.expect_error(format('select public.portal_preview_invoice(%L,%L::jsonb)',:'t2',:'claim2'),array['22023'],'no invoice is generated for a VAT-registered subcontractor without a self-billing agreement');
select test.assert(public.portal_preview_invoice(:'t2',:'claim2'::jsonb || jsonb_build_object('mode','upload','invoice_total',250))#>>'{totals,vat_treatment}'='reverse_charge',
  'they can still upload their own invoice');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.save_subcontractor_profile(:'g2',1,jsonb_build_object('business_type','limited_company','legal_name','Gina Ceramics Ltd','address','5 Mill Lane, Warrington',
  'cis_status','gross','cis_verified_on',current_date::text,'vat_registered',true,'vat_number','GB123456789',
  'self_billing_from',(current_date-1)::text,'self_billing_until',(current_date+300)::text));
reset role;
set local role anon;
select set_config('request.jwt.claims','',true);
select test.assert((public.portal_preview_invoice(:'t2',:'claim2'::jsonb)->>'self_billed')::boolean and public.portal_preview_invoice(:'t2',:'claim2'::jsonb)#>>'{totals,vat_treatment}'='reverse_charge'
  and (public.portal_preview_invoice(:'t2',:'claim2'::jsonb)#>>'{totals,gross}')::numeric=250 and (public.portal_preview_invoice(:'t2',:'claim2'::jsonb)#>>'{totals,vat_reverse_charge}')::numeric=50
  and (public.portal_preview_invoice(:'t2',:'claim2'::jsonb)#>>'{estimate,cis}')::numeric=0,
  'with a self-billing agreement in force the invoice is marked self-billed, under the reverse charge, with no CIS for gross status');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select id as link2 from public.subcontractor_portal_links where team_id=:'g2' \gset
select public.revoke_portal_link(:'link2');
reset role;
set local role anon;
select set_config('request.jwt.claims','',true);
select test.expect_error(format('select public.portal_session(%L)',:'t2'),array['42501'],'a revoked link stops working at once');
select test.expect_error(format('select public.portal_prepare_invoice(%L,gen_random_uuid(),%L::jsonb)',:'t2',:'claim2'),array['42501'],'a revoked link cannot submit an invoice');
reset role;
select test.assert(true, 'Subcontractor portal PASSED');
rollback;
