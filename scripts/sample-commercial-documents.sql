-- A fictitious job, run through the real database functions, to produce the sample documents in
-- docs/operations/samples. Disposable local database only: never apply this to a hosted project.
-- Every name is invented and every figure is dummy. The calendar is moved forward step by step so
-- each application, certificate and payment has a realistic date.
--
-- Usage (from scripts/generate-sample-documents.sh): psql -v out=<directory> -f this file
\set ON_ERROR_STOP 1
begin;
\set owner 'aa510000-0000-4000-8000-000000000001'
\set sam 'aa510000-0000-4000-8000-000000000002'
\set ola 'aa510000-0000-4000-8000-000000000003'
\set org 'aa520000-0000-4000-8000-000000000001'
\set job 'aa530000-0000-4000-8000-000000000001'
\set small 'aa530000-0000-4000-8000-000000000002'
create or replace function private.site_today() returns date language sql stable set search_path='' as $$
  select coalesce(nullif(current_setting('sample.today',true),'')::date,(now() at time zone 'Europe/London')::date) $$;
select set_config('sample.today','2026-10-21',false);
insert into auth.users(id,email) select id::uuid,id||'@example.invalid' from unnest(array[:'owner',:'sam',:'ola']) id;
insert into public.organisations(id,name) values (:'org','TileSPEC');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access) values
 (:'org',:'owner','Commercial Manager','owner',true),(:'org',:'sam','Site Supervisor','supervisor',false),(:'org',:'ola','Contracts Manager','contracts_manager',false);
insert into public.contracts(id,organisation_id,reference,name,client,principal_contractor,address,created_by,start_date,end_date) values
 (:'job',:'org','TS-2417','Example Wharf — Blocks C and D, wall and floor tiling','Example Developments Ltd','Example Construction Ltd',
  'Plot 4, Example Wharf, Exampleton EX1 2AB',:'owner','2026-06-29','2026-12-18'),
 (:'small',:'org','TS-2452','Example Primary School — washroom refurbishment','Example Education Trust','',
  'Example Lane, Exampleton EX3 4CD',:'owner','2026-08-24','2026-09-11');
insert into public.contract_assignments(organisation_id,contract_id,user_id) select :'org',c::uuid,u::uuid
 from unnest(array[:'job',:'small']) c cross join unnest(array[:'sam',:'ola']) u;
-- Pays an application in full: the cash the contractor sends and the CIS it deducts, as worked out
-- by the database.
create schema sample;
create function sample.pay(c uuid,n integer,d date,ref text) returns uuid language sql as $$
  select public.record_payment_receipt(gen_random_uuid(),jsonb_build_object('application_id',a->>'application_id','received_on',d,
    'amount',(a->>'payable')::numeric,'cis_deducted',(a->>'cis_expected')::numeric,'reference',ref))
  from jsonb_array_elements(public.commercial_account(c)->'applications') a where (a->>'number')::integer=n $$;
grant usage on schema sample to authenticated;
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
-- Registration details here exist only so the database can show VAT and CIS working; the sample
-- generator removes them before rendering, so no registration number appears on any sample.
select public.save_billing_profile(0,'{"trading_name":"TileSPEC","vat_registered":true,"vat_number":"GB000000000"}');
select public.save_contract_commercial(:'job',0,'{"contract_value":486250,"labour_budget":228000,"materials_budget":131000,"preliminaries_budget":18500,"contingency":9700}');
select public.save_contract_commercial(:'small',0,'{"contract_value":14860}');
select public.save_payment_terms(:'job',0,'{"basis":"interim","valuation_frequency":"monthly","valuation_day":25,"materials_on_site":true,
 "retention_percent":5,"retention_cap_percent":3,"retention_pc_release_percent":50,"defects_period_months":12,"construction_act":true,
 "due_days":7,"final_payment_days":21,"payment_notice_days":5,"pay_less_notice_days":7,"vat_treatment":"reverse_charge","vat_rate":20,
 "cis_applies":true,"cis_rate":20,"daywork_plant_markup":10,"daywork_materials_markup":15,"order_reference":"SUB-0417",
 "bill_to_name":"Example Construction Ltd","bill_to_address":"Commercial Department, 10 Example Road, Exampleton EX2 3BC",
 "payment_terms":"Monthly interim applications to the 25th. Retention 5% to a limit of 3% of the subcontract sum; half released at practical completion and the balance on making good defects."}');
select public.save_payment_terms(:'small',0,'{"basis":"completion","vat_treatment":"standard","vat_rate":20,"construction_act":true,"due_days":14,"final_payment_days":16}');

-- Day rates and extras.
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'job','category','operative','item','Tiler','unit','hour','rate',38.5)) as r_tiler \gset
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'job','category','supervisor','item','Supervisor','unit','hour','rate',46)) as r_sup \gset
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'job','category','plant','item','Floor grinder','unit','day','rate',65)) as r_grinder \gset
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'job','category','material','item','Levelling compound','unit','bag','rate',18.4)) as r_level \gset
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'job','category','material','item','Tile adhesive','unit','bag','rate',14.2)) as r_adh \gset
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'sam'),true);
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'job','kind','variation','description','Full-height feature wall tiling in the Block C entrance lobby',
 'instructed_by_name','A. Example','instructed_by_company','Example Construction Ltd','instructed_on','2026-07-14')) as vo1 \gset
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'job','kind','variation','description','Anti-slip tiles to the bin store and cycle store floors',
 'instructed_by_name','A. Example','instructed_by_company','Example Construction Ltd','instructed_on','2026-08-03')) as vo2 \gset
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'job','kind','variation','description','Additional skirting tiles to corridors on levels 3 to 6',
 'instructed_by_name','A. Example','instructed_by_company','Example Construction Ltd','instructed_on','2026-09-21')) as vo3 \gset
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'job','kind','variation','description','Change of grout colour to apartments C3.01 to C3.08',
 'instructed_by_name','B. Example','instructed_by_company','Example Developments Ltd','instructed_on','2026-10-02')) as vo4 \gset
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'job','description','Grind out and level uneven screed in Block C level 2 corridor',
 'instructed_by_name','A. Example','instructed_by_company','Example Construction Ltd','instructed_on','2026-07-01',
 'lines',jsonb_build_array(jsonb_build_object('kind','labour','label','Tiler (2 operatives)','role','operative','work_date','2026-07-01','quantity',12),
   jsonb_build_object('kind','plant','label','Floor grinder','quantity',1,'unit','day'),
   jsonb_build_object('kind','material','label','Levelling compound','quantity',6,'unit','bag')))) as dw1 \gset
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'job','description','Remove and refix wall tiles damaged by follow-on trades, apartment D4.06',
 'instructed_by_name','A. Example','instructed_by_company','Example Construction Ltd','instructed_on','2026-07-01',
 'lines',jsonb_build_array(jsonb_build_object('kind','labour','label','Tiler','role','operative','work_date','2026-07-01','quantity',7.5),
   jsonb_build_object('kind','labour','label','Supervisor','role','supervisor','work_date','2026-07-01','quantity',1.5),
   jsonb_build_object('kind','material','label','Tile adhesive','quantity',4,'unit','bag')))) as dw2 \gset
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'job','description','Prepare and prime lobby feature wall','instructed_by_name','A. Example',
 'instructed_on','2026-07-01','lines',jsonb_build_array(jsonb_build_object('kind','labour','label','Tiler','role','operative','work_date','2026-07-01','quantity',6)))) as dw3 \gset
select public.send_daywork(x::uuid,gen_random_uuid(),1) from unnest(array[:'vo1',:'vo2',:'vo3',:'vo4',:'dw1',:'dw2',:'dw3']) x;
select public.record_daywork_signoff(:'dw1',gen_random_uuid(),'{"outcome":"signed","signer_name":"A. Example","signer_position":"Site manager","signer_company":"Example Construction Ltd"}');
select public.record_daywork_signoff(:'dw2',gen_random_uuid(),'{"outcome":"signed","signer_name":"A. Example","signer_position":"Site manager","signer_company":"Example Construction Ltd"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'ola'),true);
select public.decide_daywork(x::uuid,gen_random_uuid(),2,'{"decision":"approve"}') from unnest(array[:'vo1',:'vo2',:'vo3',:'vo4']) x;
select public.decide_daywork(x::uuid,gen_random_uuid(),3,'{"decision":"approve"}') from unnest(array[:'dw1',:'dw2']) x;
select public.decide_daywork(:'dw3',gen_random_uuid(),2,'{"decision":"approve"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select public.price_daywork(:'vo1',gen_random_uuid(),3,'{"method":"quoted","total":6850,"note":"Quotation Q-2417-01"}');
select public.price_daywork(:'vo2',gen_random_uuid(),3,'{"method":"quoted","total":2340,"note":"Quotation Q-2417-02"}');
select public.price_daywork(:'vo3',gen_random_uuid(),3,'{"method":"quoted","total":3975,"note":"Quotation Q-2417-03"}');
select public.price_daywork(:'vo4',gen_random_uuid(),3,'{"method":"quoted","total":1260,"note":"Quotation Q-2417-04"}');
select public.price_daywork(:'dw1',gen_random_uuid(),4,jsonb_build_object('lines',jsonb_build_array(
 jsonb_build_object('line_id',(select id from public.daywork_lines where daywork_id=:'dw1' and position=1),'rate_id',:'r_tiler'),
 jsonb_build_object('line_id',(select id from public.daywork_lines where daywork_id=:'dw1' and position=2),'rate_id',:'r_grinder'),
 jsonb_build_object('line_id',(select id from public.daywork_lines where daywork_id=:'dw1' and position=3),'rate_id',:'r_level'))));
select public.price_daywork(:'dw2',gen_random_uuid(),4,jsonb_build_object('lines',jsonb_build_array(
 jsonb_build_object('line_id',(select id from public.daywork_lines where daywork_id=:'dw2' and position=1),'rate_id',:'r_tiler'),
 jsonb_build_object('line_id',(select id from public.daywork_lines where daywork_id=:'dw2' and position=2),'rate_id',:'r_sup'),
 jsonb_build_object('line_id',(select id from public.daywork_lines where daywork_id=:'dw2' and position=3),'rate_id',:'r_adh'))));
select public.price_daywork(:'dw3',gen_random_uuid(),3,jsonb_build_object('lines',jsonb_build_array(
 jsonb_build_object('line_id',(select id from public.daywork_lines where daywork_id=:'dw3' and position=1),'rate_id',:'r_tiler'))));
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'ola'),true);
-- The owner approves the charges; the contracts manager records the client's instructions.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select public.approve_daywork_charge(x::uuid,gen_random_uuid(),4,'{}') from unnest(array[:'vo1',:'vo2',:'vo3',:'vo4',:'dw3']) x;
select public.approve_daywork_charge(x::uuid,gen_random_uuid(),5,'{}') from unnest(array[:'dw1',:'dw2']) x;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'ola'),true);
select public.record_daywork_client_authorisation(:'vo1',gen_random_uuid(),'{"outcome":"authorised","client_name":"Example Construction Ltd","reference":"CVI-031","decided_on":"2026-07-16"}');
select public.record_daywork_client_authorisation(:'vo2',gen_random_uuid(),'{"outcome":"authorised","client_name":"Example Construction Ltd","reference":"CVI-044","decided_on":"2026-08-05"}');
select public.record_daywork_client_authorisation(:'vo4',gen_random_uuid(),'{"outcome":"authorised","client_name":"Example Construction Ltd","reference":"CVI-058","decided_on":"2026-10-06"}');
select public.record_daywork_client_authorisation(x::uuid,gen_random_uuid(),jsonb_build_object('outcome','authorised','client_name','Example Construction Ltd','reference','DWS-'||n,'decided_on','2026-07-03'))
 from unnest(array[:'dw1',:'dw2',:'dw3']) with ordinality u(x,n);
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select public.include_daywork_in_variation(gen_random_uuid(),jsonb_build_object('daywork_id',:'dw3','variation_id',:'vo1','note','Preparation is included in the VO-1 quotation'));
select public.raise_commercial_dispute(gen_random_uuid(),jsonb_build_object('daywork_id',:'vo4','raised_on','2026-10-20','raised_by_party','client',
 'summary','The developer considers the grout colour change part of the original specification'));

-- Applications 1 to 4.
select set_config('sample.today','2026-07-27',false);
select public.create_payment_application(gen_random_uuid(),jsonb_build_object('contract_id',:'job','period_end','2026-07-25','cis_materials',9800,'lines',jsonb_build_array(
 jsonb_build_object('kind','contract_works','description','Wall and floor tiling to Block C, levels 1 and 2','amount',38500),
 jsonb_build_object('kind','materials_on_site','description','Porcelain floor tiles stored in the Block C compound','amount',9800)))) as a1 \gset
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','payment_application','contract_id',:'job','application_id',:'a1','application_version',1));
select set_config('sample.today','2026-08-06',false);
select public.certify_payment_application(:'a1',gen_random_uuid(),2,'{"certified_gross":47900,"certificate_reference":"PC-01","certified_on":"2026-08-06"}');
select set_config('sample.today','2026-08-24',false);
select sample.pay(:'job',1,'2026-08-24','BACS 240826');

select set_config('sample.today','2026-08-26',false);
select public.create_payment_application(gen_random_uuid(),jsonb_build_object('contract_id',:'job','period_end','2026-08-25','cis_materials',27300,'lines',jsonb_build_array(
 jsonb_build_object('kind','contract_works','description','Wall and floor tiling to Block C, levels 1 to 4','amount',96750),
 jsonb_build_object('kind','extra_work','daywork_id',:'vo1','description','Full-height feature wall, Block C lobby','amount',6850),
 jsonb_build_object('kind','materials_on_site','description','Porcelain wall and floor tiles stored on site','amount',14200)))) as a2 \gset
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','payment_application','contract_id',:'job','application_id',:'a2','application_version',1));
select set_config('sample.today','2026-09-02',false);
select public.certify_payment_application(:'a2',gen_random_uuid(),2,'{"certified_gross":117800,"certificate_reference":"PC-02","certified_on":"2026-09-02"}');
select set_config('sample.today','2026-09-22',false);
select sample.pay(:'job',2,'2026-09-22','BACS 220926');

select set_config('sample.today','2026-09-28',false);
select public.create_payment_application(gen_random_uuid(),jsonb_build_object('contract_id',:'job','period_end','2026-09-25','cis_materials',31200,'lines',jsonb_build_array(
 jsonb_build_object('kind','contract_works','description','Wall and floor tiling to Block C complete; Block D levels 1 and 2','amount',158920),
 jsonb_build_object('kind','extra_work','daywork_id',:'vo1','description','Full-height feature wall, Block C lobby','amount',6850),
 jsonb_build_object('kind','extra_work','daywork_id',:'dw1','description','Grind out and level screed, Block C level 2 corridor','amount',dw.total),
 jsonb_build_object('kind','materials_on_site','description','Porcelain wall and floor tiles stored on site','amount',16450))))
 as a3 from (select total from public.daywork_pricings where daywork_id=:'dw1') dw \gset
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','payment_application','contract_id',:'job','application_id',:'a3','application_version',1));
select set_config('sample.today','2026-10-05',false);
select public.certify_payment_application(:'a3',gen_random_uuid(),2,jsonb_build_object('certified_gross',181500,'certificate_reference','PC-03','certified_on','2026-10-05'));
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','invoice','contract_id',:'job','application_id',:'a3')) as inv3 \gset
select set_config('sample.today','2026-10-26',false);
select sample.pay(:'job',3,'2026-10-26','BACS 261026');

select set_config('sample.today','2026-10-27',false);
select public.create_payment_application(gen_random_uuid(),jsonb_build_object('contract_id',:'job','period_end','2026-10-25','cis_materials',38600,
 'note','Valuation agreed on site with the contractor''s quantity surveyor on 23 October 2026.','lines',jsonb_build_array(
 jsonb_build_object('kind','contract_works','description','Wall and floor tiling to Block C complete; Block D levels 1 to 4','amount',214380),
 jsonb_build_object('kind','extra_work','daywork_id',:'vo1','description','Full-height feature wall, Block C lobby','amount',6850),
 jsonb_build_object('kind','extra_work','daywork_id',:'vo2','description','Anti-slip tiles to bin and cycle stores','amount',2340),
 jsonb_build_object('kind','extra_work','daywork_id',:'dw1','description','Grind out and level screed, Block C level 2 corridor','amount',dw1.total),
 jsonb_build_object('kind','extra_work','daywork_id',:'dw2','description','Remove and refix damaged wall tiles, apartment D4.06','amount',dw2.total),
 jsonb_build_object('kind','materials_on_site','description','Porcelain wall and floor tiles for Block D stored on site','amount',18600),
 jsonb_build_object('kind','deduction','description','Agreed contra charge: shared welfare facilities, August to October','amount',420))))
 as a4 from (select total from public.daywork_pricings where daywork_id=:'dw1') dw1,(select total from public.daywork_pricings where daywork_id=:'dw2') dw2 \gset
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','payment_application','contract_id',:'job','application_id',:'a4','application_version',1)) as pa4 \gset
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','variation_schedule','contract_id',:'job')) as vs \gset
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','daywork_summary','contract_id',:'job')) as ds \gset
select set_config('sample.today','2026-11-06',false);
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','credit_note','contract_id',:'job','invoice_id',:'inv3','amount',500,
 'reason','Agreed reduction for the delayed start to Block D level 2')) as cn \gset
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','statement','contract_id',:'job')) as st \gset

-- The small job: paid on completion, with a final account and a VAT invoice.
select set_config('sample.today','2026-09-14',false);
select public.record_contract_completion(:'small',1,'{"practical_completion_on":"2026-09-11"}');
select public.create_payment_application(gen_random_uuid(),jsonb_build_object('contract_id',:'small','kind','final','period_end','2026-09-11','lines',jsonb_build_array(
 jsonb_build_object('kind','contract_works','description','Washroom wall and floor tiling, four washrooms, complete','amount',14860),
 jsonb_build_object('kind','other','description','Additional tiled window reveals, agreed on site','amount',385)))) as fa1 \gset
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','final_account','contract_id',:'small','application_id',:'fa1','application_version',1)) as fa \gset
select public.issue_commercial_document(gen_random_uuid(),jsonb_build_object('kind','invoice','contract_id',:'small','application_id',:'fa1')) as fainv \gset

-- Snapshot files, one per document.
reset role;
\pset tuples_only on
\pset format unaligned
\o :out/payment-application.json
select jsonb_build_object('kind',kind,'reference',reference,'title',title,'issued_on',issued_on,'snapshot',snapshot) from public.commercial_documents where id=:'pa4';
\o :out/invoice.json
select jsonb_build_object('kind',kind,'reference',reference,'title',title,'issued_on',issued_on,'snapshot',snapshot) from public.commercial_documents where id=:'inv3';
\o :out/credit-note.json
select jsonb_build_object('kind',kind,'reference',reference,'title',title,'issued_on',issued_on,'snapshot',snapshot) from public.commercial_documents where id=:'cn';
\o :out/variation-schedule.json
select jsonb_build_object('kind',kind,'reference',reference,'title',title,'issued_on',issued_on,'snapshot',snapshot) from public.commercial_documents where id=:'vs';
\o :out/daywork-summary.json
select jsonb_build_object('kind',kind,'reference',reference,'title',title,'issued_on',issued_on,'snapshot',snapshot) from public.commercial_documents where id=:'ds';
\o :out/statement.json
select jsonb_build_object('kind',kind,'reference',reference,'title',title,'issued_on',issued_on,'snapshot',snapshot) from public.commercial_documents where id=:'st';
\o :out/final-account.json
select jsonb_build_object('kind',kind,'reference',reference,'title',title,'issued_on',issued_on,'snapshot',snapshot) from public.commercial_documents where id=:'fa';
\o :out/final-account-invoice.json
select jsonb_build_object('kind',kind,'reference',reference,'title',title,'issued_on',issued_on,'snapshot',snapshot) from public.commercial_documents where id=:'fainv';
\o
rollback;
