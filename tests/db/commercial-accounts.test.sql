-- Commercial accounts (C6). Disposable database only. Every figure below is worked out by hand in
-- the comment beside it, so the calculations are checked against arithmetic, not against themselves.
begin;
\set owner 'c6510000-0000-4000-8000-000000000001'
\set dave 'c6510000-0000-4000-8000-000000000002'
\set mia 'c6510000-0000-4000-8000-000000000003'
\set faye 'c6510000-0000-4000-8000-000000000004'
\set org 'c6520000-0000-4000-8000-000000000001'
\set c1 'c6530000-0000-4000-8000-000000000001'
\set c2 'c6530000-0000-4000-8000-000000000002'
\set c3 'c6530000-0000-4000-8000-000000000003'
insert into auth.users(id,email) select id::uuid,id||'@example.invalid' from unnest(array[:'owner',:'dave',:'mia',:'faye']) id;
insert into public.organisations(id,name) values (:'org','Commercial accounts test');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access)
select :'org',id::uuid,name,role::public.operations_role,money from (values
 (:'owner','Olive Owner','owner',true),(:'dave','Dave Supervisor','supervisor',false),(:'mia','Mia Manager','contracts_manager',false),
 (:'faye','Faye Finance','contracts_manager',true)) people(id,name,role,money);
insert into public.contracts(id,organisation_id,reference,name,client,principal_contractor,address,created_by) values
 (:'c1',:'org','TS-101','Riverside apartments','Example Client Ltd','Example Main Contractor Ltd','1 Example Street, Exampletown',:'owner'),
 (:'c2',:'org','TS-102','Staged school refurbishment','Example Client Ltd','','',:'owner'),
 (:'c3',:'org','TS-103','Small washroom','Example Client Ltd','','',:'owner');
insert into public.contract_assignments(organisation_id,contract_id,user_id)
select :'org',c::uuid,u::uuid from unnest(array[:'c1',:'c2',:'c3']) c cross join unnest(array[:'dave',:'mia',:'faye']) u;
-- One application's figures, read through the money-only account function as the caller.
create function test.app(c uuid,n integer) returns jsonb language sql as $$
  select a from jsonb_array_elements(public.commercial_account(c)->'applications') a where (a->>'number')::integer=n $$;
create function test.extra(c uuid,ref text) returns jsonb language sql as $$
  select e from jsonb_array_elements(public.commercial_account(c)->'extras') e where e->>'reference'=ref $$;
grant execute on function test.app(uuid,integer),test.extra(uuid,text) to authenticated;
set local role authenticated;

-- ---------------------------------------------------------------------------------------------
-- Business details and payment terms
-- ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select test.expect_error('select public.save_billing_profile(0,''{"legal_name":"Not the owner"}'')',array['42501'],'only the owner records TileSPEC''s business details');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select test.expect_error('select public.save_billing_profile(0,''{"legal_name":"Test Tiling Ltd","vat_registered":true}'')',array['22023'],
 'VAT registration needs its number; nothing is assumed');
select test.expect_error('select public.save_billing_profile(0,''{"legal_name":"Test Tiling Ltd","bank_sort_code":"12-34","bank_account_number":"12345678"}'')',array['22023'],
 'a sort code is six digits');
select test.expect_error('select public.save_billing_profile(0,''{"legal_name":"Test Tiling Ltd","vat_registered":true,"vat_number":"GB12"}'')',array['22023'],'a VAT number is checked');
select public.save_billing_profile(0,'{"legal_name":"Test Tiling Ltd","registered_address":"2 Test Road, Testville","vat_registered":true,"vat_number":"gb 123 4567 89",
 "bank_account_name":"Test Tiling Ltd","bank_sort_code":"200000","bank_account_number":"12345678","email":"Accounts@Example.invalid"}');
select test.assert((select vat_number='GB123456789' and bank_sort_code='20-00-00' and email='accounts@example.invalid' and company_number is null and phone is null
   from public.organisation_billing_profiles),'business details are normalised, and fields left blank stay blank');

select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select test.expect_error(format('select public.save_payment_terms(%L,0,''{"basis":"interim"}'')',:'c1'),array['22023'],'payment terms need the contract value first');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select public.save_contract_commercial(:'c1',0,'{"contract_value":250000,"labour_budget":120000,"materials_budget":60000,"preliminaries_budget":10000,"contingency":5000}');
select public.save_contract_commercial(:'c2',0,'{"contract_value":30000}');
select public.save_contract_commercial(:'c3',0,'{"contract_value":4800}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
-- Contract 1: monthly interim valuations, a 25,000 advance recovered pro rata, materials on site,
-- 5% retention capped at 3% of the contract sum (7,500) with half released at practical
-- completion, Construction Act timing, the domestic reverse charge, CIS at 20% and daywork markups.
select public.save_payment_terms(:'c1',0,'{"basis":"interim","valuation_frequency":"monthly","valuation_day":25,"advance_payment":25000,"advance_recovery":"pro_rata",
 "materials_on_site":true,"retention_percent":5,"retention_cap_percent":3,"retention_pc_release_percent":50,"defects_period_months":12,"construction_act":true,
 "due_days":7,"final_payment_days":21,"payment_notice_days":5,"pay_less_notice_days":7,"vat_treatment":"reverse_charge","vat_rate":20,"cis_applies":true,"cis_rate":20,
 "daywork_plant_markup":10,"daywork_materials_markup":15,"order_reference":"SC-4471","bill_to_name":"Example Main Contractor Ltd","payment_terms":"Interim monthly; see subcontract clause 4."}');
select test.assert((select retention_percent=5 and payment_terms like 'Interim monthly%' from public.contract_commercials where contract_id=:'c1')
 and (select version=1 and vat_treatment='reverse_charge' from public.contract_payment_terms where contract_id=:'c1'),
 'the retention percentage and narrative terms are saved with the payment terms in one step');
select test.expect_error(format('select public.save_payment_terms(%L,0,''{"basis":"interim","valuation_frequency":"monthly"}'')',:'c1'),array['40001'],
 'payment terms opened before someone else saved them are refused');
select test.expect_error(format('select public.save_payment_terms(%L,1,''{"basis":"interim","valuation_frequency":"monthly","cis_applies":true,"cis_rate":15}'')',:'c1'),
 array['22023'],'CIS is deducted at 0, 20 or 30 percent only');

-- Nobody without money access sees any of it.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert((select count(*)=0 from public.contract_payment_terms) and (select count(*)=0 from public.organisation_billing_profiles),
 'a supervisor reads no payment terms and no business or bank details');
select test.expect_error(format('select public.commercial_account(%L)',:'c1'),array['42501'],'a supervisor cannot read the accounts');
select test.expect_error(format('select public.save_payment_terms(%L,1,''{}'')',:'c1'),array['42501'],'a supervisor cannot change payment terms');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.assert((select count(*)=0 from public.contract_payment_terms) and (select count(*)=0 from public.organisation_billing_profiles),
 'an office user without money access reads no payment terms or business details');
select test.expect_error(format('select public.preview_commercial_document(jsonb_build_object(''kind'',''statement'',''contract_id'',%L))',:'c1'),array['42501'],
 'an office user without money access cannot preview a document');

-- ---------------------------------------------------------------------------------------------
-- Variations and dayworks: only agreed extras count
-- ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','operative','item','Tiler','unit','hour','rate',38)) as r_lab \gset
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','plant','item','Floor grinder','unit','day','rate',60)) as r_plant \gset
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','material','item','Adhesive','unit','bag','rate',12.5)) as r_mat \gset
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','kind','variation','description','Feature wall in reception','instructed_by_name','Sam Site')) as vo1 \gset
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','kind','variation','description','Additional skirting tiles','instructed_by_name','Sam Site')) as vo2 \gset
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','kind','variation','description','Change of grout colour','instructed_by_name','Sam Site')) as vo3 \gset
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Grind out high spots in corridor','instructed_by_name','Sam Site',
 'lines',jsonb_build_array(jsonb_build_object('kind','labour','label','Marek','role','operative','work_date',private.site_today(),'quantity',8),
   jsonb_build_object('kind','plant','label','Floor grinder','quantity',1,'unit','day'),jsonb_build_object('kind','material','label','Adhesive','quantity',2,'unit','bag')))) as dw1 \gset
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Prepare reception wall','instructed_by_name','Sam Site',
 'lines',jsonb_build_array(jsonb_build_object('kind','labour','label','Marek','role','operative','work_date',private.site_today(),'quantity',4)))) as dw2 \gset
select public.send_daywork(x::uuid,gen_random_uuid(),1) from unnest(array[:'vo1',:'vo2',:'vo3',:'dw1',:'dw2']) x;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select public.decide_daywork(x::uuid,gen_random_uuid(),2,'{"decision":"approve"}') from unnest(array[:'vo1',:'vo2',:'vo3',:'dw1',:'dw2']) x;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.price_daywork(:'vo1',gen_random_uuid(),3,'{"method":"quoted","total":4500}');
select public.price_daywork(:'vo2',gen_random_uuid(),3,'{"method":"quoted","total":1200}');
select public.price_daywork(:'vo3',gen_random_uuid(),3,'{"method":"quoted","total":800}');
select public.price_daywork(:'dw1',gen_random_uuid(),3,jsonb_build_object('lines',jsonb_build_array(
 jsonb_build_object('line_id',(select id from public.daywork_lines where daywork_id=:'dw1' and position=1),'rate_id',:'r_lab'),
 jsonb_build_object('line_id',(select id from public.daywork_lines where daywork_id=:'dw1' and position=2),'rate_id',:'r_plant'),
 jsonb_build_object('line_id',(select id from public.daywork_lines where daywork_id=:'dw1' and position=3),'rate_id',:'r_mat'))));
select public.price_daywork(:'dw2',gen_random_uuid(),3,jsonb_build_object('lines',jsonb_build_array(
 jsonb_build_object('line_id',(select id from public.daywork_lines where daywork_id=:'dw2' and position=1),'rate_id',:'r_lab'))));
-- DW-1: 8 h x 38 = 304.00; grinder 60.00 + 10% = 66.00; adhesive 2 x 12.50 = 25.00 + 15% = 28.75. Total 398.75.
select test.assert((select total=398.75 from public.daywork_pricings where daywork_id=:'dw1')
 and (select array_agg(markup order by markup)=array[0,3.75,6.00]::numeric[] from public.daywork_pricing_lines l join public.daywork_pricings p on p.id=l.pricing_id where p.daywork_id=:'dw1'),
 'agreed daywork markups are applied to plant and materials and kept on each priced line');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select public.approve_daywork_charge(x::uuid,gen_random_uuid(),4,'{}') from unnest(array[:'vo1',:'vo2',:'vo3',:'dw1',:'dw2']) x;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
-- VO-2 is never authorised by the client, which the contract requires.
select public.record_daywork_client_authorisation(x::uuid,gen_random_uuid(),jsonb_build_object('outcome','authorised','client_name','Sam Site','reference','CI-'||n))
 from unnest(array[:'vo1',:'vo3',:'dw1',:'dw2']) with ordinality u(x,n);
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.record_daywork_signoff(:'dw1',gen_random_uuid(),'{"outcome":"signed","signer_name":"Sam Site","signer_position":"Site manager"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.raise_commercial_dispute(gen_random_uuid(),jsonb_build_object('daywork_id',:'vo3','raised_by_party','client','summary','Client says the grout change was in the original scope')) as dispute_vo3 \gset
select public.include_daywork_in_variation(gen_random_uuid(),jsonb_build_object('daywork_id',:'dw2','variation_id',:'vo1','note','Preparation is part of the feature wall price'));
select test.expect_error(format('select public.include_daywork_in_variation(gen_random_uuid(),jsonb_build_object(''daywork_id'',%L,''variation_id'',%L))',:'dw2',:'vo2'),
 array['23505'],'a daywork is included in one variation at most');
select test.assert((test.extra(:'c1','VO-1')->>'state')='approved' and (test.extra(:'c1','VO-1')->>'claimable')::boolean
 and (test.extra(:'c1','VO-2')->>'state')='submitted' and not (test.extra(:'c1','VO-2')->>'claimable')::boolean
 and (test.extra(:'c1','VO-3')->>'state')='disputed' and not (test.extra(:'c1','VO-3')->>'claimable')::boolean
 and (test.extra(:'c1','DW-2')->>'included_in')::uuid=:'vo1' and not (test.extra(:'c1','DW-2')->>'claimable')::boolean,
 'variations read as submitted, approved, disputed or rejected; a daywork in a variation is not charged on its own');
select test.assert((select revised_value=254898.75 and extras_agreed=4898.75 and extras_agreed_count=2 and extras_pending=2000 and extras_pending_count=2
   from public.contract_financial_positions(array[:'c1'::uuid])),
 'the revised contract value is the original plus agreed extras only (VO-1 4,500 and DW-1 398.75); unauthorised and disputed variations stay pending');

-- ---------------------------------------------------------------------------------------------
-- Application 1: the advance payment
-- ---------------------------------------------------------------------------------------------
select test.expect_error(format('select public.create_payment_application(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''kind'',''advance'',''period_end'',''2026-09-30'',
 ''lines'',jsonb_build_array(jsonb_build_object(''kind'',''contract_works'',''description'',''Work'',''amount'',1))))',:'c1'),array['22023'],'an advance application has no valuation lines');
select public.create_payment_application(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','kind','advance','period_end','2026-09-30')) as app1 \gset
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','payment_application','contract_id',:'c1','application_id',:'app1','application_version',1)) as doc_pa1 \gset
-- Advance 25,000; no VAT charged under the reverse charge (5,000 for information); CIS 20% = 5,000.
select test.assert((test.app(:'c1',1)->>'status')='submitted' and (test.app(:'c1',1)->>'net')::numeric=25000 and (test.app(:'c1',1)->>'applied_this_period')::numeric=25000
 and (test.app(:'c1',1)->>'vat')::numeric=0 and (test.app(:'c1',1)->>'vat_reverse_charge')::numeric=5000 and (test.app(:'c1',1)->>'cis_expected')::numeric=5000
 and (test.app(:'c1',1)->>'payable')::numeric=20000 and (test.app(:'c1',1)->>'due_on')::date=private.site_today()+7 and (test.app(:'c1',1)->>'final_on')::date=private.site_today()+28
 and (test.app(:'c1',1)->>'payment_notice_by')::date=private.site_today()+12 and (test.app(:'c1',1)->>'pay_less_by')::date=private.site_today()+21,
 'approving and issuing the advance application submits it, with VAT, CIS and every Construction Act date worked out');
select test.assert((select reference='TS-101/PA-01' and title='Application for advance payment' and net=25000 and snapshot_sha256=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex')
   and snapshot->'issuer'->>'vat_number'='GB123456789' and snapshot->'issuer'->>'company_number' is null and snapshot->'bill_to'->>'name'='Example Main Contractor Ltd'
   from public.commercial_documents where id=:'doc_pa1'),
 'the issued document is numbered, prints only the recorded business details, and its content hash is stored');
select public.certify_payment_application(:'app1',gen_random_uuid(),2,'{"certified_gross":0,"certificate_reference":"PC-0"}');
select public.record_payment_receipt(gen_random_uuid(),jsonb_build_object('application_id',:'app1','amount',20000,'cis_deducted',5000,'reference','BACS 0001'));
select test.assert((test.app(:'c1',1)->>'certified_net')::numeric=25000 and (test.app(:'c1',1)->>'display_status')='paid' and (test.app(:'c1',1)->>'outstanding')::numeric=0,
 'the advance is paid once the cash and the CIS deducted together settle it');

-- ---------------------------------------------------------------------------------------------
-- Application 2: interim valuation, certificate, pay less notice, part and full payment, invoice
-- ---------------------------------------------------------------------------------------------
select format('select public.create_payment_application(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''period_end'',''2026-10-25'',''lines'',jsonb_build_array(
 jsonb_build_object(''kind'',''contract_works'',''description'',''Works'',''amount'',1000),jsonb_build_object(''kind'',''extra_work'',''daywork_id'',%%L,''description'',''Extra'',''amount'',%%s))))',:'c1') as claim \gset
select test.expect_error(format(:'claim',:'vo2',1200),array['22023'],'a variation the client has not authorised cannot be claimed');
select test.expect_error(format(:'claim',:'vo3',800),array['22023'],'a disputed variation cannot be claimed');
select test.expect_error(format(:'claim',:'dw2',152),array['22023'],'a daywork included in a variation cannot be charged again');
select test.expect_error(format(:'claim',:'vo1',4500.01),array['22023'],'an extra cannot be claimed above its agreed value');
select public.create_payment_application(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','period_end','2026-10-25','cis_materials',9000,'lines',jsonb_build_array(
 jsonb_build_object('kind','contract_works','description','Wall and floor tiling, blocks A and B','amount',60000),
 jsonb_build_object('kind','extra_work','daywork_id',:'vo1','description','VO-1 Feature wall in reception','amount',4500),
 jsonb_build_object('kind','extra_work','daywork_id',:'dw1','description','DW-1 Grind out high spots','amount',398.75),
 jsonb_build_object('kind','materials_on_site','description','Porcelain tiles stored on site','amount',8000),
 jsonb_build_object('kind','deduction','description','Agreed contra charge: skip hire','amount',350)))) as app2 \gset
-- Gross 60,000 + 4,500 + 398.75 + 8,000 = 72,898.75. Retention 5% = 3,644.94 (under the 7,500 cap).
-- Advance recovered pro rata: 25,000 x 60,000 / 250,000 = 6,000. Net to date
-- 72,898.75 - 3,644.94 + 25,000 - 6,000 - 350 = 87,903.81. Less the 25,000 previously certified: 62,903.81.
select test.assert((test.app(:'c1',2)->>'gross')::numeric=72898.75 and (test.app(:'c1',2)->'valuation'->>'retention_held')::numeric=3644.94
 and (test.app(:'c1',2)->'valuation'->>'advance_recovered')::numeric=6000 and (test.app(:'c1',2)->'valuation'->>'deductions')::numeric=350
 and (test.app(:'c1',2)->>'net')::numeric=87903.81 and (test.app(:'c1',2)->>'previous_notified')::numeric=25000
 and (test.app(:'c1',2)->>'applied_this_period')::numeric=62903.81 and (test.app(:'c1',2)->>'display_status')='draft',
 'a cumulative interim valuation: extras, materials on site, retention, advance recovery and deductions, less what was previously certified');
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','payment_application','contract_id',:'c1','application_id',:'app2','application_version',1)) as doc_pa2 \gset
select test.expect_error(format('select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object(''kind'',''payment_application'',''contract_id'',%L,''application_id'',%L))',:'c1',:'app2'),
 array['22023'],'an issued application is not issued again as if new; a correction is a revision');
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','payment_application','contract_id',:'c1','application_id',:'app2','supersedes_id',:'doc_pa2',
 'revision_reason','Client asked for the order reference on the cover')) as doc_pa2a \gset
select test.assert((select reference='TS-101/PA-02 Rev A' and revision=1 and supersedes_id=:'doc_pa2' from public.commercial_documents where id=:'doc_pa2a')
 and (select superseded_by_id=:'doc_pa2a' and superseded_at is not null from public.commercial_documents where id=:'doc_pa2'),
 'a revision names the document it replaces and why, and both stay on record');
select test.expect_error(format('select public.update_payment_application(%L,gen_random_uuid(),2,''{"lines":[{"kind":"contract_works","description":"More","amount":99999}]}'')',:'app2'),
 array['22023'],'an issued application''s figures cannot be changed');
-- The client certifies a gross of 71,000: retention 3,550, deductions 350, advance as applied.
-- Certified net 71,000 - 3,550 + 25,000 - 6,000 - 350 = 86,100; due this period 61,100.
select public.certify_payment_application(:'app2',gen_random_uuid(),2,'{"certified_gross":71000,"certificate_reference":"PC-2"}');
select test.assert((test.app(:'c1',2)->>'certified_retention')::numeric=3550 and (test.app(:'c1',2)->>'certified_net')::numeric=86100
 and (test.app(:'c1',2)->>'due_this_period')::numeric=61100 and (test.app(:'c1',2)->>'certificate_in_time')::boolean
 and (test.app(:'c1',2)->>'cis_expected')::numeric=10420 and (test.app(:'c1',2)->>'display_status')='certified',
 'the certificate (payment notice) sets the sum due; CIS is expected on the labour element only: 20% of (61,100 - 9,000) = 10,420');
-- A pay less notice given in time reduces the sum due to 58,000.
select public.record_pay_less_notice(gen_random_uuid(),jsonb_build_object('application_id',:'app2','sum_stated',58000,'basis','Contra charge for damaged tiles, 3,100','reference','PLN-2'));
select test.assert((test.app(:'c1',2)->>'pay_less_effective')::boolean and (test.app(:'c1',2)->>'due_this_period')::numeric=58000
 and (test.app(:'c1',2)->>'notified_cumulative')::numeric=83000 and (test.app(:'c1',2)->>'cis_expected')::numeric=9800,
 'a valid pay less notice replaces the notified sum for that payment');
select public.record_payment_receipt(gen_random_uuid(),jsonb_build_object('application_id',:'app2','amount',30000,'reference','BACS 0002'));
select test.assert((test.app(:'c1',2)->>'display_status')='part_paid' and (test.app(:'c1',2)->>'outstanding')::numeric=28000,'a part payment leaves the rest outstanding');
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','invoice','contract_id',:'c1','application_id',:'app2')) as inv2 \gset
select test.assert((select reference='INV-00001' and net=58000 and vat=0 and total=58000 and (snapshot->'invoice'->>'vat_reverse_charge')::numeric=11600
   and snapshot->'invoice'->>'vat_treatment'='reverse_charge' and snapshot->'invoice'->>'basis'='pay_less' from public.commercial_documents where id=:'inv2'),
 'the invoice is for the sum due under the pay less notice, with the reverse-charge VAT shown but not charged');
select test.expect_error(format('select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object(''kind'',''invoice'',''contract_id'',%L,''application_id'',%L))',:'c1',:'app2'),
 array['22023'],'an application is invoiced once; a change needs a credit note first');
select test.expect_error(format('select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object(''kind'',''invoice'',''contract_id'',%L,''supersedes_id'',%L,''application_id'',%L,''revision_reason'',''Fix it''))',:'c1',:'inv2',:'app2'),
 array['22023'],'an invoice is never revised; it is corrected by credit note');
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','credit_note','contract_id',:'c1','invoice_id',:'inv2','amount',1000,'reason','Agreed discount for late access')) as cn1 \gset
select test.assert((select reference='CN-00001' and net=1000 and vat=0 and total=1000 and credits_document_id=:'inv2' from public.commercial_documents where id=:'cn1'),
 'a credit note credits part of an invoice, numbered in its own unbroken sequence');
select test.expect_error(format('select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object(''kind'',''credit_note'',''contract_id'',%L,''invoice_id'',%L,''amount'',57000.01,''reason'',''Too much''))',:'c1',:'inv2'),
 array['22023'],'a credit note cannot exceed what is left uncredited on the invoice');
select test.expect_error(format('select public.cancel_payment_application(%L,%s,''Wrong'')',:'app2',(select version from public.payment_applications where id=:'app2')),
 array['22023'],'an invoiced or certified application cannot be cancelled');
select public.record_payment_receipt(gen_random_uuid(),jsonb_build_object('application_id',:'app2','amount',18200,'cis_deducted',9800,'reference','BACS 0003'));
select test.assert((test.app(:'c1',2)->>'display_status')='paid' and (test.app(:'c1',2)->>'received')::numeric=58000,'application 2 is paid in cash and CIS deducted');

-- ---------------------------------------------------------------------------------------------
-- Application 3: retention cap and release at practical completion; default notice; overdue
-- ---------------------------------------------------------------------------------------------
select test.expect_error(format('select public.record_contract_completion(%L,1,jsonb_build_object(''practical_completion_on'',private.site_today()+1))',:'c1'),
 array['22023'],'practical completion cannot be recorded in advance');
select public.record_contract_completion(:'c1',1,'{"practical_completion_on":"2026-11-01"}');
select public.create_payment_application(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','period_end','2026-11-05','cis_materials',20000,'lines',jsonb_build_array(
 jsonb_build_object('kind','contract_works','description','Wall and floor tiling, all blocks','amount',200000),
 jsonb_build_object('kind','extra_work','daywork_id',:'vo1','description','VO-1 Feature wall in reception','amount',4500),
 jsonb_build_object('kind','extra_work','daywork_id',:'dw1','description','DW-1 Grind out high spots','amount',398.75),
 jsonb_build_object('kind','deduction','description','Agreed contra charge: skip hire','amount',350)))) as app3 \gset
-- Gross 204,898.75; 5% would be 10,244.94 but the cap is 7,500, of which half is released at
-- practical completion: 3,750 held. Advance recovered 25,000 x 200,000 / 250,000 = 20,000.
-- Net 204,898.75 - 3,750 + 25,000 - 20,000 - 350 = 205,798.75; less 83,000 notified = 122,798.75.
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','payment_application','contract_id',:'c1','application_id',:'app3','application_version',1));
select test.assert((test.app(:'c1',3)->'valuation'->>'retention_full')::numeric=10244.94 and (test.app(:'c1',3)->'valuation'->>'retention')::numeric=7500
 and (test.app(:'c1',3)->'valuation'->>'retention_capped')::boolean and (test.app(:'c1',3)->'valuation'->>'retention_released_pc')::numeric=3750
 and (test.app(:'c1',3)->>'retention_held')::numeric=3750 and (test.app(:'c1',3)->'valuation'->>'advance_recovered')::numeric=20000
 and (test.app(:'c1',3)->>'net')::numeric=205798.75 and (test.app(:'c1',3)->>'applied_this_period')::numeric=122798.75,
 'retention stops at its cap and half is released from practical completion, without double counting earlier sums');
select test.expect_error(format('select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object(''kind'',''default_payment_notice'',''contract_id'',%L,''application_id'',%L))',:'c1',:'app3'),
 array['22023'],'a default payment notice waits until the client''s payment notice is late');
-- Twenty days later the client has given no payment notice (it was due by day 12).
reset role;
create or replace function private.site_today() returns date language sql stable set search_path='' as $$ select (now() at time zone 'Europe/London')::date+20 $$;
set local role authenticated;
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','default_payment_notice','contract_id',:'c1','application_id',:'app3')) as dpn3 \gset
-- Given 8 days late, so the final date moves from day 28 to day 36.
select test.assert((select reference='TS-101/DPN-03' and net=122798.75 and final_on=(now() at time zone 'Europe/London')::date+36 from public.commercial_documents where id=:'dpn3')
 and (test.app(:'c1',3)->>'due_this_period')::numeric=122798.75 and (test.app(:'c1',3)->>'final_on_effective')::date=(now() at time zone 'Europe/London')::date+36
 and (test.app(:'c1',3)->>'display_status')='submitted',
 'TileSPEC''s default payment notice stands as the notified sum and postpones the final date by the days it was late');
reset role;
create or replace function private.site_today() returns date language sql stable set search_path='' as $$ select (now() at time zone 'Europe/London')::date+40 $$;
set local role authenticated;
select public.record_pay_less_notice(gen_random_uuid(),jsonb_build_object('application_id',:'app3','sum_stated',100000,'basis','Late valuation by the client'));
select test.assert((test.app(:'c1',3)->>'display_status')='overdue' and (test.app(:'c1',3)->>'overdue_days')::integer=4
 and not (test.app(:'c1',3)->>'pay_less_in_time')::boolean and not (test.app(:'c1',3)->>'pay_less_effective')::boolean
 and (test.app(:'c1',3)->>'due_this_period')::numeric=122798.75,
 'unpaid after the final date it is overdue; a pay less notice given after the deadline does not reduce the sum under the Construction Act');
select public.raise_commercial_dispute(gen_random_uuid(),jsonb_build_object('application_id',:'app3','raised_by_party','tilespec','summary','Referred for adjudication over the late pay less notice','amount_disputed',22798.75)) as disp3 \gset
select test.assert((test.app(:'c1',3)->>'display_status')='disputed','an application with an open dispute shows as disputed');
select public.resolve_commercial_dispute(:'disp3','{"resolution":"Client accepted the notified sum"}');
select test.assert((test.app(:'c1',3)->>'display_status')='overdue','once resolved, its payment status shows again');

-- ---------------------------------------------------------------------------------------------
-- Final account: retention fully released after making good; advance fully recovered
-- ---------------------------------------------------------------------------------------------
select public.record_contract_completion(:'c1',2,jsonb_build_object('making_good_on',private.site_today()));
select public.create_payment_application(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','kind','final','period_end',private.site_today(),'lines',jsonb_build_array(
 jsonb_build_object('kind','contract_works','description','Contract works complete','amount',250000),
 jsonb_build_object('kind','extra_work','daywork_id',:'vo1','description','VO-1 Feature wall in reception','amount',4500),
 jsonb_build_object('kind','extra_work','daywork_id',:'dw1','description','DW-1 Grind out high spots','amount',398.75),
 jsonb_build_object('kind','deduction','description','Agreed contra charge: skip hire','amount',350)))) as app4 \gset
select test.expect_error(format('select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object(''kind'',''payment_application'',''contract_id'',%L,''application_id'',%L,''application_version'',1))',:'c1',:'app4'),
 array['22023'],'the final account is issued as a final account');
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','final_account','contract_id',:'c1','application_id',:'app4','application_version',1)) as fa \gset
-- Gross 254,898.75; retention 7,500 of which 3,750 released at completion and 3,750 at making good.
-- Advance recovered in full. Net 254,898.75 - 0 + 25,000 - 25,000 - 350 = 254,548.75; less the
-- 205,798.75 notified on application 3: 48,750.00.
select test.assert((test.app(:'c1',4)->>'retention_held')::numeric=0 and (test.app(:'c1',4)->'valuation'->>'retention_released_final')::numeric=3750
 and (test.app(:'c1',4)->'valuation'->>'advance_recovered')::numeric=25000 and (test.app(:'c1',4)->>'net')::numeric=254548.75
 and (test.app(:'c1',4)->>'applied_this_period')::numeric=48750,
 'the final account releases the rest of the retention after making good and recovers the advance in full');
select test.assert((select reference='TS-101/FA-04' and title='Final account' and jsonb_array_length(snapshot->'receipts')=3 and jsonb_array_length(snapshot->'credit_notes')=1
   and jsonb_array_length(snapshot->'history')=3 and (snapshot->'contract_sum'->>'revised')::numeric=254898.75 from public.commercial_documents where id=:'fa'),
 'the final account carries the full reconciliation: history, payments, credit notes and the revised contract sum');
select test.expect_error(format('select public.create_payment_application(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''period_end'',%L,''lines'',jsonb_build_array(
 jsonb_build_object(''kind'',''contract_works'',''description'',''More'',''amount'',1))))',:'c1',private.site_today()+1),array['22023'],
 'after the final account, any further application is a revised final account');

-- Statement of account: debits are each application's sum due (or its invoices and credit notes),
-- credits each payment. 25,000 + 58,000 - 1,000 + 122,798.75 + 48,750 - 25,000 - 58,000 = 170,548.75.
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','statement','contract_id',:'c1')) as st1 \gset
select test.assert((select (snapshot->>'balance')::numeric=170548.75 and jsonb_array_length(snapshot->'entries')=8 and (snapshot->'ageing'->>'days_1_30')::numeric=122798.75
   and (snapshot->>'retention_held')::numeric=0 and reference='TS-101/ST-01' from public.commercial_documents where id=:'st1'),
 'the statement shows every sum due, invoice, credit note and payment, the running balance and what is overdue');
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','variation_schedule','contract_id',:'c1')) as vs1 \gset
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','daywork_summary','contract_id',:'c1')) as ds1 \gset
select test.assert((select jsonb_array_length(snapshot->'extras')=3 and (select x->>'state' from jsonb_array_elements(snapshot->'extras') x where x->>'reference'='VO-3')='disputed'
   and (select x->'includes'->>0 from jsonb_array_elements(snapshot->'extras') x where x->>'reference'='VO-1')='DW-2'
   and (select (x->>'claimed_in')::integer from jsonb_array_elements(snapshot->'extras') x where x->>'reference'='VO-1')=4
   from public.commercial_documents where id=:'vs1'),
 'the variation schedule shows each variation''s state, the dayworks it includes and the application it was claimed in');
select test.assert((select jsonb_array_length(snapshot->'dayworks')=2
   and (select x->'site_acknowledgement'->>'signer_name' from jsonb_array_elements(snapshot->'dayworks') x where x->>'reference'='DW-1')='Sam Site'
   and (select x->'client_authorisation'->>'reference' from jsonb_array_elements(snapshot->'dayworks') x where x->>'reference'='DW-1')='CI-3'
   and (select x->>'commercial_status' from jsonb_array_elements(snapshot->'dayworks') x where x->>'reference'='DW-1')='commercially_approved'
   and (select x->>'included_in' from jsonb_array_elements(snapshot->'dayworks') x where x->>'reference'='DW-2')='VO-1'
   from public.commercial_documents where id=:'ds1'),
 'the daywork summary keeps site acknowledgement, commercial approval and client authorisation separate');
select test.assert((select received=83000 and revised_value=254898.75 from public.contract_financial_positions(array[:'c1'::uuid])),
 'the financial position counts CIS deducted as received');

-- ---------------------------------------------------------------------------------------------
-- Contract 2: stage payments, standard-rated VAT
-- ---------------------------------------------------------------------------------------------
select public.save_payment_terms(:'c2',0,'{"basis":"milestones","vat_treatment":"standard","due_days":14,"final_payment_days":14}');
select public.add_payment_stage(gen_random_uuid(),jsonb_build_object('contract_id',:'c2','label','Ground floor complete','amount',10000)) as st_a \gset
select public.add_payment_stage(gen_random_uuid(),jsonb_build_object('contract_id',:'c2','label','First floor complete','amount',12000)) as st_b \gset
select public.add_payment_stage(gen_random_uuid(),jsonb_build_object('contract_id',:'c2','label','Handover','amount',8000)) as st_c \gset
select test.expect_error(format('select public.create_payment_application(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''period_end'',''2026-10-31'',''lines'',jsonb_build_array(
 jsonb_build_object(''kind'',''contract_works'',''description'',''Measured'',''amount'',100))))',:'c2'),array['22023'],'a stage-paid contract claims stages, not measured work');
select test.expect_error(format('select public.create_payment_application(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''period_end'',''2026-10-31'',''lines'',jsonb_build_array(
 jsonb_build_object(''kind'',''stage'',''stage_id'',%L,''description'',''Too much'',''amount'',12000.01))))',:'c2',:'st_b'),array['22023'],'a stage cannot be claimed above its value');
select test.expect_error(format('select public.create_payment_application(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''period_end'',''2026-10-31'',''lines'',jsonb_build_array(
 jsonb_build_object(''kind'',''materials_on_site'',''description'',''Tiles'',''amount'',100))))',:'c2'),array['22023'],'materials on site are valued only where the contract allows');
select public.create_payment_application(gen_random_uuid(),jsonb_build_object('contract_id',:'c2','period_end','2026-10-31','lines',jsonb_build_array(
 jsonb_build_object('kind','stage','stage_id',:'st_a','description','Ground floor complete','amount',10000)))) as s_app1 \gset
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','payment_application','contract_id',:'c2','application_id',:'s_app1','application_version',1));
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','invoice','contract_id',:'c2','application_id',:'s_app1')) as s_inv1 \gset
select test.assert((select reference='INV-00002' and net=10000 and vat=2000 and total=12000 from public.commercial_documents where id=:'s_inv1'),
 'standard-rated VAT at 20% is charged on a VAT invoice, and invoice numbers run on across the business');
select test.expect_error(format('select public.void_payment_stage(%L,''Changed my mind'')',:'st_a'),array['22023'],'a stage already applied for stays on record');
-- Application 2 keeps stage A and claims half of stage B: 16,000 to date, 6,000 this period.
select public.create_payment_application(gen_random_uuid(),jsonb_build_object('contract_id',:'c2','period_end','2026-11-30','lines',jsonb_build_array(
 jsonb_build_object('kind','stage','stage_id',:'st_a','description','Ground floor complete','amount',10000),
 jsonb_build_object('kind','stage','stage_id',:'st_b','description','First floor, half complete','amount',6000)))) as s_app2 \gset
select test.assert((test.app(:'c2',2)->>'gross')::numeric=16000 and (test.app(:'c2',2)->>'applied_this_period')::numeric=6000 and (test.app(:'c2',2)->>'vat')::numeric=1200,
 'stage payments are cumulative, so a stage already paid is not paid again');
-- A full credit note frees the application for a corrected invoice.
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','credit_note','contract_id',:'c2','invoice_id',:'s_inv1','reason','Invoice addressed to the wrong company')) as s_cn \gset
select test.assert((select net=10000 and vat=2000 and total=12000 and (snapshot->'credit_note'->>'full')::boolean from public.commercial_documents where id=:'s_cn'),
 'a full credit note reverses the invoice and its VAT');
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','invoice','contract_id',:'c2','application_id',:'s_app1')) as s_inv1b \gset
select test.assert((select reference='INV-00003' and total=12000 from public.commercial_documents where id=:'s_inv1b'),'after a full credit note a corrected invoice can be issued');
-- Without a recorded VAT registration no VAT is charged.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select public.save_billing_profile(1,'{"legal_name":"Test Tiling Ltd","vat_registered":false}');
select test.assert((test.app(:'c2',2)->>'vat_treatment')='not_registered' and (test.app(:'c2',2)->>'vat')::numeric=0,
 'with no VAT registration recorded a draft is valued without VAT');
select public.save_billing_profile(2,'{"legal_name":"Test Tiling Ltd","vat_registered":true,"vat_number":"GB123456789"}');

-- ---------------------------------------------------------------------------------------------
-- Contract 3: payment on completion
-- ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.save_payment_terms(:'c3',0,'{"basis":"completion","vat_treatment":"standard","construction_act":false}');
select test.expect_error(format('select public.create_payment_application(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''period_end'',''2026-10-31'',''lines'',jsonb_build_array(
 jsonb_build_object(''kind'',''contract_works'',''description'',''Work'',''amount'',100))))',:'c3'),array['22023'],'a contract paid on completion has no interim applications');
select test.expect_error(format('select public.create_payment_application(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''kind'',''final'',''period_end'',''2026-10-31'',''lines'',jsonb_build_array(
 jsonb_build_object(''kind'',''contract_works'',''description'',''Work'',''amount'',100))))',:'c3'),array['22023'],'the final account waits for practical completion');
select public.record_contract_completion(:'c3',1,'{"practical_completion_on":"2026-10-30"}');
select public.create_payment_application(gen_random_uuid(),jsonb_build_object('contract_id',:'c3','kind','final','period_end','2026-10-31','lines',jsonb_build_array(
 jsonb_build_object('kind','contract_works','description','Washroom tiling complete','amount',4800)))) as w_app \gset
select test.assert((test.app(:'c3',1)->>'net')::numeric=4800 and (test.app(:'c3',1)->>'vat')::numeric=960 and not (test.app(:'c3',1)->>'construction_act')::boolean,
 'payment on completion is a single final account; the Construction Act can be switched off, for example for a residential occupier');

-- ---------------------------------------------------------------------------------------------
-- Sharing, immutability and the supervisor boundary
-- ---------------------------------------------------------------------------------------------
select public.share_commercial_document(:'inv2','{"days":14,"recipient":"Example Main Contractor Ltd accounts"}') as token \gset
reset role;
select test.assert(not has_function_privilege('anon','public.shared_commercial_document(text)','execute')
 and not has_function_privilege('authenticated','public.shared_commercial_document(text)','execute'),
 'no browser role can open a shared link directly; only the server''s shared-link route can');
set local role service_role;
select test.assert((public.shared_commercial_document(:'token')->>'reference')='INV-00001' and public.shared_commercial_document(repeat('0',64)) is null
 and public.shared_commercial_document('not a token') is null,'a live link opens exactly its own document');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select test.assert((select view_count=1 and recipient like 'Example%' from public.commercial_document_shares where document_id=:'inv2'),'the office sees how often a shared link was opened');
select test.expect_error('select token_sha256 from public.commercial_document_shares',array['42501'],'the link secret''s hash is never readable');
select public.revoke_commercial_document_share((select id from public.commercial_document_shares where document_id=:'inv2'));
reset role;
set local role service_role;
select test.assert(public.shared_commercial_document(:'token') is null,'a revoked link opens nothing');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert((select count(*)=0 from public.commercial_documents) and (select count(*)=0 from public.payment_notices) and (select count(*)=0 from public.commercial_disputes)
 and (select count(*)=0 from public.contract_payment_stages) and (select count(*)=0 from public.variation_daywork_inclusions)
 and (select count(*)=0 from public.commercial_document_shares)
 and not exists(select 1 from public.audit_events where entity_type in ('commercial_documents','contract_payment_terms','payment_notices','organisation_billing_profiles')),
 'a supervisor reads no document, notice, dispute, stage, inclusion, link or their audit');
select test.expect_error(format('select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object(''kind'',''statement'',''contract_id'',%L))',:'c1'),array['42501'],
 'a supervisor cannot issue a document');
select test.expect_error(format('select public.raise_commercial_dispute(gen_random_uuid(),jsonb_build_object(''daywork_id'',%L,''raised_by_party'',''client'',''summary'',''Site says so''))',:'vo2'),
 array['42501'],'a supervisor cannot raise a commercial dispute');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.assert((select count(*)=0 from public.commercial_documents),'an office user without money access reads no document');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select test.assert((select count(*)>=10 and bool_and(commercial) from public.audit_events where entity_type='commercial_documents'),
 'every issued document is in the commercial audit trail');
reset role;
select test.expect_error(format('update public.commercial_documents set total=1 where id=%L',:'inv2'),array['42501'],'an issued document cannot be rewritten, even by trusted SQL');
select test.expect_error(format('delete from public.commercial_documents where id=%L',:'cn1'),array['42501'],'an issued document cannot be deleted');
select test.expect_error(format('update public.payment_notices set sum_stated=1 where application_id=%L',:'app2'),array['42501'],'a notice cannot be rewritten');
select test.expect_error(format('update public.payment_applications set valuation=''{}'' where id=%L',:'app3'),array['42501'],'a submitted valuation cannot be rewritten');
select test.expect_error(format('delete from public.contract_payment_terms where contract_id=%L',:'c1'),array['42501'],'payment terms cannot be deleted');
rollback;
