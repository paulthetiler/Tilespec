-- One financial position per contract (C5). Disposable database only.
begin;
\set owner 'c5510000-0000-4000-8000-000000000001'
\set dave 'c5510000-0000-4000-8000-000000000002'
\set mia 'c5510000-0000-4000-8000-000000000003'
\set faye 'c5510000-0000-4000-8000-000000000004'
\set org 'c5520000-0000-4000-8000-000000000001'
\set c1 'c5530000-0000-4000-8000-000000000001'
\set c2 'c5530000-0000-4000-8000-000000000002'
\set subco 'c5540000-0000-4000-8000-000000000001'
\set marek 'c5560000-0000-4000-8000-000000000001'
\set sam 'c5560000-0000-4000-8000-000000000002'
\set una 'c5560000-0000-4000-8000-000000000003'
insert into auth.users(id,email) select id::uuid,id||'@example.invalid' from unnest(array[:'owner',:'dave',:'mia',:'faye']) id;
insert into public.organisations(id,name) values (:'org','Position test');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access)
select :'org',id::uuid,name,role::public.operations_role,money from (values
 (:'owner','Olive Owner','owner',true),(:'dave','Dave Supervisor','supervisor',false),(:'mia','Mia Manager','contracts_manager',false),
 (:'faye','Faye Finance','contracts_manager',true)) people(id,name,role,money);
insert into public.contracts(id,organisation_id,reference,name,created_by) values (:'c1',:'org','FP-1','Position site',:'owner'),(:'c2',:'org','FP-2','No budget yet',:'owner');
insert into public.contract_assignments(organisation_id,contract_id,user_id) values (:'org',:'c1',:'dave'),(:'org',:'c1',:'mia'),(:'org',:'c1',:'faye');
insert into public.subcontractor_companies(id,organisation_id,name) values (:'subco',:'org','SubCo Tiling Ltd');
insert into public.operatives(id,organisation_id,display_name,engagement,company_id) values
 (:'marek',:'org','Marek','direct_employee',null),(:'sam',:'org','Sam','subcontractor',:'subco'),(:'una',:'org','Una','agency',null);
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
-- Budget: value 100,000; costs 40,000 + 25,000 + 5,000 = 70,000; contingency 3,000; target 25%; retention 5%.
select public.save_contract_commercial(:'c1',0,'{"contract_value":100000,"labour_budget":40000,"materials_budget":25000,"preliminaries_budget":5000,"contingency":3000,"target_margin":25,"retention_percent":5}');
select public.create_locations(:'c1',gen_random_uuid(),null,'[{"name":"Level 1"}]');
select id as l1 from public.work_areas where name='Level 1' \gset

-- Extras: DW-1 agreed (approved, charged, client authorised) at 320; VO-1 priced 1,250.50 awaiting the client;
-- VO-2 approved but not priced; DW-2 rejected.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Bin store wall','instructed_by_name','Sam Site',
 'lines',jsonb_build_array(jsonb_build_object('kind','labour','label','Marek','role','operative','work_date',private.site_today(),'quantity',8)))) as dw1 \gset
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','kind','variation','description','Full height tiling','instructed_by_name','Sam Site')) as vo1 \gset
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','kind','variation','description','Brushed steel trims','instructed_by_name','Sam Site')) as vo2 \gset
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Clean up','instructed_by_name','Sam Site',
 'lines',jsonb_build_array(jsonb_build_object('kind','labour','label','Marek','role','operative','work_date',private.site_today(),'quantity',1)))) as dw2 \gset
select public.send_daywork(id,gen_random_uuid(),1) from (values (:'dw1'::uuid),(:'vo1'::uuid),(:'vo2'::uuid),(:'dw2'::uuid)) v(id);
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select public.decide_daywork(id,gen_random_uuid(),2,'{"decision":"approve"}') from (values (:'dw1'::uuid),(:'vo1'::uuid),(:'vo2'::uuid)) v(id);
select public.decide_daywork(:'dw2',gen_random_uuid(),2,'{"decision":"reject","note":"In the contract"}');
select public.record_daywork_client_authorisation(:'dw1',gen_random_uuid(),'{"outcome":"authorised","client_name":"Main Contractor","reference":"CVI-1"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','operative','item','Operative','unit','hour','rate',40)) as rate \gset
select public.price_daywork(:'dw1',gen_random_uuid(),4,jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('line_id',(select id from public.daywork_lines where daywork_id=:'dw1'),'rate_id',:'rate'))));
select public.price_daywork(:'vo1',gen_random_uuid(),3,'{"method":"quoted","total":1250.5}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select public.approve_daywork_charge(:'dw1',gen_random_uuid(),5,'{}');
select public.approve_daywork_charge(:'vo1',gen_random_uuid(),4,'{}');

-- Labour on 20 October: Marek 8 h at 20 = 160; Sam 8 h at SubCo's day rate 180; Una 2 h with no rate.
reset role;
insert into public.actual_allocations(id,organisation_id,contract_id,work_area_id,stage,work_date,started_at,ended_at,ended_recorded_at,confirmed_by) values
 ('c5580000-0000-4000-8000-000000000001',:'org',:'c1',:'l1','installation','2026-10-20','2026-10-20 08:00+01','2026-10-20 16:00+01',now(),:'dave');
insert into public.actual_allocation_operatives(organisation_id,contract_id,actual_allocation_id,operative_id,joined_at,left_at,left_recorded_at,added_by) values
 (:'org',:'c1','c5580000-0000-4000-8000-000000000001',:'marek','2026-10-20 08:00+01',null,null,:'dave'),
 (:'org',:'c1','c5580000-0000-4000-8000-000000000001',:'sam','2026-10-20 08:00+01',null,null,:'dave'),
 (:'org',:'c1','c5580000-0000-4000-8000-000000000001',:'una','2026-10-20 14:00+01',null,null,:'dave');
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.save_labour_rate(gen_random_uuid(),jsonb_build_object('subject','operative','subject_id',:'marek','basis','hour','rate',20,'effective_from','2026-01-01'));
select public.save_labour_rate(gen_random_uuid(),jsonb_build_object('subject','company','subject_id',:'subco','basis','day','rate',180,'effective_from','2026-01-01'));
-- Purchases: materials 1,200; SubCo invoice 500 (overlaps with Sam's costed attendance); other 100; and a voided cost.
select public.record_job_cost(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','materials','supplier','Tile Supplies','description','Adhesive','net_amount',1200));
select public.record_job_cost(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','subcontract','company_id',:'subco','description','Grouting','net_amount',500));
select public.record_job_cost(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','other','supplier','Skip hire','description','Skip','net_amount',100));
select public.record_job_cost(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','plant','supplier','Hire Co','description','Wrongly entered','net_amount',999)) as wrong \gset
select public.void_job_cost(:'wrong','Wrong job');
-- Application 1: work to date 10,000 plus DW-1 at 320 = 10,320; certified at 10,000 (net 9,500 after 5%); 9,000 received.
select public.create_payment_application(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','period_end','2026-10-31','lines',jsonb_build_array(
 jsonb_build_object('kind','contract_works','description','Work to date','amount',10000),
 jsonb_build_object('kind','extra_work','daywork_id',:'dw1','description','DW-1','amount',320)))) as app1 \gset
select public.submit_payment_application(:'app1',gen_random_uuid(),1);
select public.certify_payment_application(:'app1',gen_random_uuid(),2,'{"certified_gross":10000}');
select public.record_payment_receipt(gen_random_uuid(),jsonb_build_object('application_id',:'app1','amount',9000));

create temp table pos as select * from public.contract_financial_positions(array[:'c1'::uuid,:'c2'::uuid]);
select test.assert((select count(*)=1 from pos) and (select contract_id=:'c1' from pos),'a contracts manager with money access sees only the jobs they are on');
select test.assert((select has_budget and original_value=100000 and budget_cost=70000 and contingency=3000 and target_margin=25 and retention_percent=5 from pos),
 'the position starts from the original budget');
select test.assert((select extras_agreed=320 and extras_agreed_count=1 and extras_pending=1250.50 and extras_pending_count=1 and extras_unpriced_count=1 and revised_value=100320 from pos),
 'agreed extras raise the contract value; priced extras awaiting the client are pending; unpriced and rejected ones add nothing');
select test.assert((select labour_cost=340 and labour_hours_without_rate=2 and labour_still_on_site=0 and materials_cost=1200 and subcontract_cost=500
   and plant_cost=0 and other_cost=100 and actual_cost=2140 from pos),
 'actual cost is labour from attendance plus purchases and invoices, without the voided entry');
select test.assert((select forecast_cost=70000 and forecast_profit=27320 and forecast_margin=27.23 and budget_profit=27000 and budget_margin=27.00 from pos),
 'forecast: cost to date plus the unspent budget, contingency held back; the extra raises profit to 27,320 (27.23 percent)');
select test.assert((select applied_gross=10320 and certified_gross=10000 and certified_net=9500 and retention_held=500 and received=9000 and outstanding=500 from pos),
 'applied, certified, retention held, received and outstanding come from the applications and payments');
select test.assert((select subcontract_overlap=1 from pos),'a subcontract invoice from a company whose people are costed from attendance is flagged');
drop table pos;

-- The client authorises VO-1: it moves from pending to agreed.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select public.record_daywork_client_authorisation(:'vo1',gen_random_uuid(),'{"outcome":"authorised","client_name":"Main Contractor","reference":"VI-2"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select test.assert((select extras_agreed=1570.50 and extras_pending=0 and revised_value=101570.50 and forecast_profit=28570.50
   from public.contract_financial_positions(array[:'c1'::uuid])),'once the client authorises a variation it is part of the revised value and the forecast');

-- When costs pass the budget, the forecast follows the actual cost.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select public.record_job_cost(gen_random_uuid(),jsonb_build_object('contract_id',:'c2','category','materials','supplier','Tile Supplies','description','Early order','net_amount',500));
select test.assert((select count(*)=2 from public.contract_financial_positions(array[:'c1'::uuid,:'c2'::uuid])),'the owner sees every job');
select test.assert((select not has_budget and original_value=0 and actual_cost=500 and forecast_cost=500 and forecast_profit=-500 and forecast_margin is null
   and applied_gross is null and outstanding is null from public.contract_financial_positions(array[:'c2'::uuid])),
 'a job with no budget yet still shows its actual cost, and no margin is invented');

-- Nobody without money access gets a position.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert((select count(*)=0 from public.contract_financial_positions(array[:'c1'::uuid])),'a supervisor gets no financial position');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.assert((select count(*)=0 from public.contract_financial_positions(array[:'c1'::uuid])),'an office user without money access gets no financial position');
select test.assert(not has_function_privilege('authenticated','private.contract_financial_position(uuid)','execute'),'the worker function cannot be called directly');
rollback;
