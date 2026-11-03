-- Payment applications and payments received (C4). Disposable database only.
begin;
\set owner 'c4510000-0000-4000-8000-000000000001'
\set dave 'c4510000-0000-4000-8000-000000000002'
\set mia 'c4510000-0000-4000-8000-000000000003'
\set faye 'c4510000-0000-4000-8000-000000000004'
\set org 'c4520000-0000-4000-8000-000000000001'
\set c1 'c4530000-0000-4000-8000-000000000001'
insert into auth.users(id,email) select id::uuid,id||'@example.invalid' from unnest(array[:'owner',:'dave',:'mia',:'faye']) id;
insert into public.organisations(id,name) values (:'org','Payment applications test');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access)
select :'org',id::uuid,name,role::public.operations_role,money from (values
 (:'owner','Olive Owner','owner',true),(:'dave','Dave Supervisor','supervisor',false),(:'mia','Mia Manager','contracts_manager',false),
 (:'faye','Faye Finance','contracts_manager',true)) people(id,name,role,money);
insert into public.contracts(id,organisation_id,reference,name,created_by) values (:'c1',:'org','PA-1','Valued site',:'owner');
insert into public.contract_assignments(organisation_id,contract_id,user_id) values (:'org',:'c1',:'dave'),(:'org',:'c1',:'mia'),(:'org',:'c1',:'faye');
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select public.save_contract_commercial(:'c1',0,'{"contract_value":100000,"labour_budget":40000,"materials_budget":25000,"preliminaries_budget":5000,"contingency":3000,"retention_percent":5}');

-- Approved extras: a daywork priced from rates, and a variation priced as a quoted sum; and a daywork not yet charge-approved.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Tile the bin store wall','instructed_by_name','Sam Site',
 'lines',jsonb_build_array(jsonb_build_object('kind','labour','label','Marek','role','operative','work_date',private.site_today(),'quantity',8)))) as dw \gset
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','kind','variation','description','Full height tiling in the showers',
 'instructed_by_name','Sam Site')) as vo \gset
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Move pallets','instructed_by_name','Sam Site',
 'lines',jsonb_build_array(jsonb_build_object('kind','labour','label','Marek','role','operative','work_date',private.site_today(),'quantity',1)))) as dw_pending \gset
select public.send_daywork(:'dw',gen_random_uuid(),1); select public.send_daywork(:'vo',gen_random_uuid(),1); select public.send_daywork(:'dw_pending',gen_random_uuid(),1);
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select public.decide_daywork(:'dw',gen_random_uuid(),2,'{"decision":"approve"}');
select public.decide_daywork(:'vo',gen_random_uuid(),2,'{"decision":"approve"}');
select public.decide_daywork(:'dw_pending',gen_random_uuid(),2,'{"decision":"approve"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','operative','item','Operative','unit','hour','rate',40)) as rate \gset
select public.price_daywork(:'dw',gen_random_uuid(),3,jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('line_id',(select id from public.daywork_lines where daywork_id=:'dw'),'rate_id',:'rate'))));
select public.price_daywork(:'vo',gen_random_uuid(),3,'{"method":"quoted","total":1250.5}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select public.approve_daywork_charge(:'dw',gen_random_uuid(),4,'{}');
select public.approve_daywork_charge(:'vo',gen_random_uuid(),4,'{}');

-- Only money access can raise an application.
select format('{"contract_id":"%s","period_end":"2026-10-31","lines":[{"kind":"contract_works","description":"Work to date","amount":10000}]}',:'c1') as simple \gset
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.expect_error(format('select public.create_payment_application(gen_random_uuid(),%L)',:'simple'),array['42501'],'a supervisor cannot raise a payment application');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.expect_error(format('select public.create_payment_application(gen_random_uuid(),%L)',:'simple'),array['42501'],'an office user without money access cannot either');

-- Application 1: work to date 10,000, the two approved extras at their priced totals, and materials on site.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select test.expect_error(format('select public.create_payment_application(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''period_end'',''2026-10-31'',''lines'',jsonb_build_array(
 jsonb_build_object(''kind'',''extra_work'',''daywork_id'',%L,''description'',''Not charge approved'',''amount'',40))))',:'c1',:'dw_pending'),
 array['22023'],'extra work is claimed only once the office approved it and its charge is approved');
select test.expect_error(format('select public.create_payment_application(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''period_end'',''2026-10-31'',''lines'',jsonb_build_array(
 jsonb_build_object(''kind'',''extra_work'',''daywork_id'',%L,''description'',''Once'',''amount'',320),jsonb_build_object(''kind'',''extra_work'',''daywork_id'',%L,''description'',''Twice'',''amount'',320))))',:'c1',:'dw',:'dw'),
 array['23505'],'the same extra cannot be claimed twice in one application');
select test.expect_error(format('select public.create_payment_application(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''period_end'',''2026-10-31'',''lines'',jsonb_build_array(
 jsonb_build_object(''kind'',''contract_works'',''description'',''Negative'',''amount'',-5))))',:'c1'),array['22023'],'the value of work done cannot be negative');
select test.expect_error(format('select public.create_payment_application(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''lines'',jsonb_build_array(
 jsonb_build_object(''kind'',''contract_works'',''description'',''No date'',''amount'',5))))',:'c1'),array['22023'],'a valuation needs the date it runs to');
select public.create_payment_application(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','period_end','2026-10-31','lines',jsonb_build_array(
 jsonb_build_object('kind','contract_works','description','Tiling completed to 31 October','amount',10000),
 jsonb_build_object('kind','extra_work','daywork_id',:'dw','description','DW-1 bin store wall','amount',320),
 jsonb_build_object('kind','extra_work','daywork_id',:'vo','description','VO-1 full height tiling','amount',1250.5),
 jsonb_build_object('kind','materials_on_site','description','Tiles delivered, not fixed','amount',500)))) as app1 \gset
select test.assert((select number=1 and status='draft' from public.payment_applications where id=:'app1')
 and (select gross=12070.50 and retention=603.53 and net=11466.97 from public.payment_application_summaries(:'c1') where application_id=:'app1'),
 'a draft application values the work, the approved extras and materials on site; retention at 5 percent');
select test.expect_error(format('select public.create_payment_application(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''period_end'',''2026-11-30'',''lines'',jsonb_build_array(
 jsonb_build_object(''kind'',''contract_works'',''description'',''Second'',''amount'',1))))',:'c1'),array['22023'],'only one draft at a time on a job');

-- The draft is corrected; earlier lines are kept.
select public.update_payment_application(:'app1',gen_random_uuid(),1,jsonb_build_object('lines',jsonb_build_array(
 jsonb_build_object('kind','contract_works','description','Tiling completed to 31 October','amount',11000),
 jsonb_build_object('kind','extra_work','daywork_id',:'dw','description','DW-1 bin store wall','amount',320),
 jsonb_build_object('kind','extra_work','daywork_id',:'vo','description','VO-1 full height tiling','amount',1250.5),
 jsonb_build_object('kind','materials_on_site','description','Tiles delivered, not fixed','amount',500))));
select test.assert((select lines_version=2 from public.payment_applications where id=:'app1')
 and (select count(*)=8 from public.payment_application_lines where application_id=:'app1')
 and (select gross=13070.50 from public.payment_application_summaries(:'c1') where application_id=:'app1'),
 'a corrected draft keeps its earlier lines on record and is valued from the current set');

-- Submitted: figures are fixed, including the retention percentage.
select public.submit_payment_application(:'app1',gen_random_uuid(),2);
select public.save_contract_commercial(:'c1',1,'{"retention_percent":3}');
select test.assert((select status='submitted' and gross_applied=13070.50 and retention_percent=5 and submitted_by_name='Faye Finance' from public.payment_applications where id=:'app1')
 and (select gross=13070.50 and retention=653.53 and net=12416.97 and net_this_period=12416.97 from public.payment_application_summaries(:'c1') where application_id=:'app1'),
 'submitting fixes the gross and the 5 percent retention, even if the contract''s retention changes later');
select test.expect_error(format('select public.update_payment_application(%L,gen_random_uuid(),3,''{"lines":[{"kind":"contract_works","description":"More","amount":99999}]}'')',:'app1'),
 array['22023'],'a submitted application cannot be changed');
select test.expect_error(format('select public.record_payment_receipt(gen_random_uuid(),jsonb_build_object(''application_id'',%L,''amount'',0))',:'app1'),array['22023'],'a payment must be more than nothing');

-- Certified, then paid.
select public.certify_payment_application(:'app1',gen_random_uuid(),3,'{"certified_gross":12500,"certificate_reference":"PC-1"}');
select public.record_payment_receipt(gen_random_uuid(),jsonb_build_object('application_id',:'app1','amount',11000,'reference','BACS 0412')) as pay1 \gset
select test.assert((select certified_gross=12500 and certified_retention=625.00 and certified_net=11875.00 and certified_this_period=11875.00 and received=11000
   from public.payment_application_summaries(:'c1') where application_id=:'app1'),
 'the certificate and the payment received are recorded against the application');
select test.expect_error(format('select public.cancel_payment_application(%L,4,''Wrong'')',:'app1'),array['22023'],'a certified application is final');

-- Application 2 runs to a later date, and "this period" is the difference.
select test.expect_error(format('select public.create_payment_application(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''period_end'',''2026-10-31'',''lines'',jsonb_build_array(
 jsonb_build_object(''kind'',''contract_works'',''description'',''Same date'',''amount'',20000))))',:'c1'),array['22023'],'each application runs to a later date');
select public.create_payment_application(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','period_end','2026-11-30','lines',jsonb_build_array(
 jsonb_build_object('kind','contract_works','description','Tiling completed to 30 November','amount',20000)))) as app2 \gset
select test.assert((select gross=20000 and retention_percent=3 and retention=600 and net=19400 and net_this_period=19400-12416.97
   from public.payment_application_summaries(:'c1') where application_id=:'app2'),
 'a draft uses the contract''s current retention, and this period is the net to date less the last application''s');
select test.expect_error(format('select public.record_payment_receipt(gen_random_uuid(),jsonb_build_object(''application_id'',%L,''amount'',10))',:'app2'),
 array['22023'],'no payment is recorded against a draft');
select public.cancel_payment_application(:'app2',1,'Raised too early');
select test.assert((select status='cancelled' and cancel_reason='Raised too early' from public.payment_applications where id=:'app2')
 and (select net_this_period is null from public.payment_application_summaries(:'c1') where application_id=:'app2'),
 'a draft entered in error is cancelled with a reason and kept on record');
select public.void_payment_receipt(:'pay1','Recorded against the wrong job');
select test.assert((select received=0 from public.payment_application_summaries(:'c1') where application_id=:'app1'),'a voided payment no longer counts');

-- Nobody without money access reads any of it.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert((select count(*)=0 from public.payment_applications) and (select count(*)=0 from public.payment_application_lines)
 and (select count(*)=0 from public.payment_receipts)
 and not exists(select 1 from public.audit_events where entity_type in ('payment_applications','payment_application_lines','payment_receipts')),
 'a supervisor reads no application, line, payment or their audit');
select test.expect_error(format('select * from public.payment_application_summaries(%L)',:'c1'),array['42501'],'a supervisor cannot see the figures');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.assert((select count(*)=0 from public.payment_applications),'an office user without money access reads no application');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select test.assert((select count(*)>=6 and bool_and(commercial) from public.audit_events where entity_type in ('payment_applications','payment_application_lines','payment_receipts')),
 'every application, line and payment is audited as commercial');
reset role;
select test.expect_error(format('update public.payment_applications set certified_gross=1 where id=%L',:'app1'),array['42501'],'a certified application cannot be rewritten, even by trusted SQL');
select test.expect_error(format('delete from public.payment_applications where id=%L',:'app2'),array['42501'],'an application cannot be deleted');
select test.expect_error(format('update public.payment_application_lines set amount=1 where application_id=%L',:'app1'),array['42501'],'lines cannot be rewritten');
rollback;
