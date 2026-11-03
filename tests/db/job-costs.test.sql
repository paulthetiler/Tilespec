-- Job costs (C3): labour from attendance, purchases and invoices, materials used. Disposable database only.
begin;
\set owner 'c3510000-0000-4000-8000-000000000001'
\set dave 'c3510000-0000-4000-8000-000000000002'
\set mia 'c3510000-0000-4000-8000-000000000003'
\set faye 'c3510000-0000-4000-8000-000000000004'
\set ellie 'c3510000-0000-4000-8000-000000000005'
\set org 'c3520000-0000-4000-8000-000000000001'
\set c1 'c3530000-0000-4000-8000-000000000001'
\set c2 'c3530000-0000-4000-8000-000000000002'
\set subco 'c3540000-0000-4000-8000-000000000001'
\set gang 'c3550000-0000-4000-8000-000000000001'
\set marek 'c3560000-0000-4000-8000-000000000001'
\set sam 'c3560000-0000-4000-8000-000000000002'
\set ann 'c3560000-0000-4000-8000-000000000003'
\set bob 'c3560000-0000-4000-8000-000000000004'
\set una 'c3560000-0000-4000-8000-000000000005'
insert into auth.users(id,email) select id::uuid,id||'@example.invalid' from unnest(array[:'owner',:'dave',:'mia',:'faye',:'ellie']) id;
insert into public.organisations(id,name) values (:'org','Job costs test');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access)
select :'org',id::uuid,name,role::public.operations_role,money from (values
 (:'owner','Olive Owner','owner',true),(:'dave','Dave Supervisor','supervisor',false),(:'mia','Mia Manager','contracts_manager',false),
 (:'faye','Faye Finance','contracts_manager',true),(:'ellie','Ellie Elsewhere','supervisor',false)) people(id,name,role,money);
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 (:'c1',:'org','JC-1','Costed site',:'owner'),(:'c2',:'org','JC-2','Other site',:'owner');
insert into public.contract_assignments(organisation_id,contract_id,user_id) values
 (:'org',:'c1',:'dave'),(:'org',:'c1',:'mia'),(:'org',:'c1',:'faye'),(:'org',:'c2',:'ellie');
insert into public.subcontractor_companies(id,organisation_id,name) values (:'subco',:'org','SubCo Tiling Ltd');
insert into public.teams(id,organisation_id,name,kind,company_id) values (:'gang',:'org','Gang A','subcontract_gang',:'subco');
insert into public.operatives(id,organisation_id,display_name,engagement,company_id) values
 (:'marek',:'org','Marek','direct_employee',null),(:'sam',:'org','Sam','subcontractor',:'subco'),(:'ann',:'org','Ann','subcontractor',:'subco'),
 (:'bob',:'org','Bob','subcontractor',:'subco'),(:'una',:'org','Una','agency',null);
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
insert into public.document_revisions(id,organisation_id,contract_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes,created_by)
values ('c3570000-0000-4000-8000-000000000001',:'org',:'c1','INV-1',1,'Supplier invoice 1','commercial',
 :'org'||'/'||:'c1'||'/commercial/contract/c3570000-0000-4000-8000-000000000001.pdf',repeat('f',64),'application/pdf',10,:'owner'),
 ('c3570000-0000-4000-8000-000000000002',:'org',:'c2','INV-9',1,'Another job''s invoice','commercial',
 :'org'||'/'||:'c2'||'/commercial/contract/c3570000-0000-4000-8000-000000000002.pdf',repeat('f',64),'application/pdf',10,:'owner');
update public.document_revisions set uploaded_at=now();
set local role authenticated;
select public.create_locations(:'c1',gen_random_uuid(),null,'[{"name":"Level 1"}]');
select public.create_locations(:'c2',gen_random_uuid(),null,'[{"name":"Block B"}]');
select id as l1 from public.work_areas where name='Level 1' \gset
select id as l2 from public.work_areas where name='Block B' \gset

-- Attendance on 20 October 2026, as the supervisors recorded it.
reset role;
insert into public.actual_allocations(id,organisation_id,contract_id,work_area_id,team_id,stage,work_date,started_at,ended_at,ended_recorded_at,confirmed_by) values
 ('c3580000-0000-4000-8000-000000000001',:'org',:'c1',:'l1',null,'installation','2026-10-20','2026-10-20 08:00+01','2026-10-20 16:00+01',now(),:'dave'),
 ('c3580000-0000-4000-8000-000000000002',:'org',:'c2',:'l2',null,'installation','2026-10-20','2026-10-20 13:00+01','2026-10-20 17:00+01',now(),:'ellie'),
 ('c3580000-0000-4000-8000-000000000003',:'org',:'c1',:'l1',:'gang','installation','2026-10-20','2026-10-20 08:00+01','2026-10-20 16:00+01',now(),:'dave');
insert into public.actual_allocations(id,organisation_id,contract_id,work_area_id,team_id,stage,work_date,started_at,confirmed_by,voided_at,voided_by,void_reason) values
 ('c3580000-0000-4000-8000-000000000005',:'org',:'c1',:'l1',null,'installation','2026-10-20','2026-10-20 08:00+01',:'dave',now(),:'dave','Entered on the wrong job');
insert into public.actual_allocation_operatives(organisation_id,contract_id,actual_allocation_id,operative_id,joined_at,left_at,left_recorded_at,added_by) values
 -- Marek: 4 hours here in the morning, 4 hours on the other job in the afternoon.
 (:'org',:'c1','c3580000-0000-4000-8000-000000000001',:'marek','2026-10-20 08:00+01','2026-10-20 12:00+01',now(),:'dave'),
 (:'org',:'c2','c3580000-0000-4000-8000-000000000002',:'marek','2026-10-20 13:00+01',null,null,:'ellie'),
 -- Sam (SubCo) and Una (agency, no rate): a full day here.
 (:'org',:'c1','c3580000-0000-4000-8000-000000000001',:'sam','2026-10-20 08:00+01',null,null,:'dave'),
 (:'org',:'c1','c3580000-0000-4000-8000-000000000001',:'una','2026-10-20 10:00+01',null,null,:'dave'),
 -- Gang A, Ann and Bob, a full day here.
 (:'org',:'c1','c3580000-0000-4000-8000-000000000003',:'ann','2026-10-20 08:00+01',null,null,:'dave'),
 (:'org',:'c1','c3580000-0000-4000-8000-000000000003',:'bob','2026-10-20 08:00+01',null,null,:'dave');
insert into public.actual_allocation_operatives(organisation_id,contract_id,actual_allocation_id,operative_id,joined_at,added_by) values
 (:'org',:'c1','c3580000-0000-4000-8000-000000000005',:'bob','2026-10-20 08:00+01',:'dave');
-- Today: Marek is on site now and has not left.
insert into public.actual_allocations(id,organisation_id,contract_id,work_area_id,team_id,stage,work_date,started_at,confirmed_by) values
 ('c3580000-0000-4000-8000-000000000004',:'org',:'c1',:'l1',null,'installation',private.site_today(),now()-interval '2 hours',:'dave');
insert into public.actual_allocation_operatives(organisation_id,contract_id,actual_allocation_id,operative_id,joined_at,added_by) values
 (:'org',:'c1','c3580000-0000-4000-8000-000000000004',:'marek',now()-interval '2 hours',:'dave');
set local role authenticated;

-- Rates: only money access sets or reads them.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.expect_error(format('select public.save_labour_rate(gen_random_uuid(),jsonb_build_object(''subject'',''operative'',''subject_id'',%L,''basis'',''hour'',''rate'',20,''effective_from'',''2026-01-01''))',:'marek'),
 array['42501'],'a supervisor cannot set a labour cost rate');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.expect_error(format('select public.save_labour_rate(gen_random_uuid(),jsonb_build_object(''subject'',''operative'',''subject_id'',%L,''basis'',''hour'',''rate'',20,''effective_from'',''2026-01-01''))',:'marek'),
 array['42501'],'an office user without money access cannot set a labour cost rate');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.save_labour_rate(gen_random_uuid(),jsonb_build_object('subject','operative','subject_id',:'marek','basis','hour','rate',20,'effective_from','2026-01-01')) as r_marek \gset
select public.save_labour_rate(gen_random_uuid(),jsonb_build_object('subject','operative','subject_id',:'ann','basis','hour','rate',25,'effective_from','2026-01-01'));
select public.save_labour_rate(gen_random_uuid(),jsonb_build_object('subject','company','subject_id',:'subco','basis','day','rate',180,'effective_from','2026-01-01',
 'note','Agreed SubCo day rate per operative'));
select public.save_labour_rate(gen_random_uuid(),jsonb_build_object('subject','team','subject_id',:'gang','contract_id',:'c1','basis','day','rate',600,'effective_from','2026-10-01'));
select test.expect_error(format('select public.save_labour_rate(gen_random_uuid(),jsonb_build_object(''subject'',''team'',''subject_id'',%L,''basis'',''hour'',''rate'',60,''effective_from'',''2026-01-01''))',:'gang'),
 array['22023'],'a gang rate is a day rate');
select test.expect_error(format('select public.save_labour_rate(gen_random_uuid(),jsonb_build_object(''subject'',''operative'',''subject_id'',%L,''basis'',''hour'',''rate'',0,''effective_from'',''2026-01-01''))',:'marek'),
 array['22023'],'a rate must be more than nothing');
select test.expect_error(format('select public.save_labour_rate(gen_random_uuid(),jsonb_build_object(''subject'',''team'',''subject_id'',%L,''contract_id'',%L,''basis'',''day'',''rate'',60,''effective_from'',''2026-01-01''))',:'gang',:'c2'),
 array['42501'],'money access for one job does not set rates on a job the user is not on');

-- Labour cost for 20 October on the costed site:
--   Marek  4 h x 20 per hour                       =  80.00
--   Sam    SubCo day rate, all 8 of his hours here  = 180.00
--   Gang A gang day rate for this job (Ann's own rate is not used inside the gang) = 600.00
--   Una    6 h, no rate                             = not costed, reported
-- Today Marek is still on site: open, not costed. The voided allocation is ignored.
create temp table labour as select * from public.contract_labour_costs(:'c1');
select test.assert((select cost=80 and hours=4 and basis='hour' and status='costed' from labour where subject_id=:'marek' and work_date='2026-10-20')
 and (select cost=180 and hours=8 and basis='day' and status='costed' from labour where subject_id=:'sam')
 and (select cost=600 and hours=16 and subject='team' and name='Gang A' and status='costed' from labour where subject_id=:'gang')
 and (select cost is null and hours=6 and status='no_rate' from labour where subject_id=:'una')
 and (select status='open' and cost is null from labour where subject_id=:'marek' and work_date=private.site_today())
 and not exists(select 1 from labour where subject_id in (:'ann',:'bob')),
 'labour is costed from attendance: hourly, company day and gang day rates; no rate and open attendance are reported, not guessed');
select test.assert((select sum(cost)=860 from labour),'the costed labour on the job adds up to 860.00');
drop table labour;

-- A rate agreed for this job comes first; a rate not yet in force on the day is not used; a voided rate is ignored.
select public.save_labour_rate(gen_random_uuid(),jsonb_build_object('subject','operative','subject_id',:'marek','contract_id',:'c1','basis','hour','rate',30,'effective_from','2026-10-01')) as r_marek_job \gset
select public.save_labour_rate(gen_random_uuid(),jsonb_build_object('subject','operative','subject_id',:'marek','contract_id',:'c1','basis','hour','rate',99,'effective_from','2026-10-21'));
select test.assert((select cost=120 from public.contract_labour_costs(:'c1') where subject_id=:'marek' and work_date='2026-10-20'),
 'a rate agreed for this job comes before the general rate, and a later rate is not used for an earlier day');
select public.void_labour_rate(:'r_marek_job','Entered against the wrong operative');
select test.assert((select cost=80 from public.contract_labour_costs(:'c1') where subject_id=:'marek' and work_date='2026-10-20'),'a voided rate is no longer used');
-- A day rate is shared by hours across the jobs worked that day.
select public.save_labour_rate(gen_random_uuid(),jsonb_build_object('subject','operative','subject_id',:'marek','basis','day','rate',160,'effective_from','2026-10-15'));
select test.assert((select cost=80 and basis='day' from public.contract_labour_costs(:'c1') where subject_id=:'marek' and work_date='2026-10-20'),
 'a day rate is split by hours: 4 of Marek''s 8 hours were on this job, so half of 160');

-- Nobody without money access sees labour costs or rates.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.expect_error(format('select * from public.contract_labour_costs(%L)',:'c1'),array['42501'],'a supervisor cannot see labour costs');
select test.assert((select count(*)=0 from public.labour_cost_rates),'a supervisor reads no labour cost rate');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.expect_error(format('select * from public.contract_labour_costs(%L)',:'c1'),array['42501'],'an office user without money access cannot see labour costs');
select test.assert((select count(*)=0 from public.labour_cost_rates),'an office user without money access reads no labour cost rate');

-- Purchases and invoices (money access).
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.expect_error(format('select public.record_job_cost(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''category'',''materials'',''supplier'',''Tile Supplies'',''description'',''Adhesive'',''net_amount'',100))',:'c1'),
 array['42501'],'a supervisor cannot record a job cost');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.record_job_cost(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','materials','supplier','Tile Supplies Ltd','reference','INV-1',
 'description','Adhesive and grout delivery','cost_date','2026-10-19','net_amount',1200,'document_id','c3570000-0000-4000-8000-000000000001')) as cost_materials \gset
select public.record_job_cost(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','subcontract','company_id',:'subco','reference','SC-4',
 'description','Price work, level 1 bathrooms','cost_date','2026-10-25','net_amount',2500)) as cost_sub \gset
select public.record_job_cost(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','materials','supplier','Tile Supplies Ltd','reference','CN-1',
 'description','Credit for returned grout','net_amount',-50.25)) as cost_credit \gset
select test.assert((select count(*)=3 and sum(net_amount)=3649.75 from public.job_cost_entries where contract_id=:'c1'),
 'the office records purchases, a subcontractor''s invoice and a credit note against the job');
select test.expect_error(format('select public.record_job_cost(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''category'',''materials'',''supplier'',''X'',''description'',''Nothing'',''net_amount'',0))',:'c1'),
 array['22023','23514'],'a cost of nothing is refused');
select test.expect_error(format('select public.record_job_cost(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''category'',''materials'',''description'',''No supplier'',''net_amount'',10))',:'c1'),
 array['22023'],'a cost says who the supplier or subcontractor is');
select test.expect_error(format('select public.record_job_cost(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''category'',''materials'',''supplier'',''X'',''description'',''Wrong job doc'',''net_amount'',10,''document_id'',''c3570000-0000-4000-8000-000000000002''))',:'c1'),
 array['22023'],'evidence must be a document on this job');
select test.expect_error(format('select public.record_job_cost(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''category'',''wages'',''supplier'',''X'',''description'',''Wrong kind'',''net_amount'',10))',:'c1'),
 array['22023'],'only materials, subcontract, plant or other costs');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert((select count(*)=0 from public.job_cost_entries),'a supervisor reads no job cost');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.assert((select count(*)=0 from public.job_cost_entries),'an office user without money access reads no job cost');

-- Materials used: the supervisor records items and quantities only.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select gen_random_uuid() as mkey \gset
select jsonb_build_object('contract_id',:'c1','lines',jsonb_build_array(
  jsonb_build_object('item','Flexible adhesive','quantity',10,'unit','bag','work_area_id',:'l1'),
  jsonb_build_object('item','Grout, mid grey','quantity',3,'unit','tub','note','Bathrooms 1 to 3'))) as mdata \gset
select public.record_materials_used(:'mkey',:'mdata') as batch \gset
select public.record_materials_used(:'mkey',:'mdata') as batch_retry \gset
select test.assert(:'batch'=:'batch_retry' and (select count(*)=2 from public.site_material_records where batch_id=:'batch')
 and (select location_path=array['Level 1'] and work_date=private.site_today() and recorded_by_name='Dave Supervisor'
   from public.site_material_records where batch_id=:'batch' and position=1),
 'a supervisor records materials used with quantities and locations, and a safe retry saves nothing twice');
select test.assert(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='site_material_records'
 and column_name ~ '(price|cost|amount|rate|total)'),'a material record has nowhere to put a price');
select test.expect_error(format('select public.record_materials_used(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''lines'',jsonb_build_array(jsonb_build_object(''item'',''Adhesive'',''quantity'',1,''unit'',''bag'',''price'',12))))',:'c1'),
 array['22023'],'a material line cannot carry a price');
select test.expect_error(format('select public.record_materials_used(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''work_date'',private.site_today()+1,''lines'',jsonb_build_array(jsonb_build_object(''item'',''Adhesive'',''quantity'',1,''unit'',''bag''))))',:'c1'),
 array['22023'],'materials cannot be recorded for a future day');
select test.expect_error(format('select public.record_materials_used(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''lines'',jsonb_build_array(jsonb_build_object(''item'',''Adhesive'',''quantity'',1,''unit'',''pallet''))))',:'c1'),
 array['22023'],'materials use a known unit');
select test.expect_error(format('select public.record_materials_used(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''lines'',''[]''::jsonb))',:'c1'),
 array['22023'],'at least one material is needed');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'ellie'),true);
select test.expect_error(format('select public.record_materials_used(gen_random_uuid(),%L::jsonb)',:'mdata'),array['42501'],'a supervisor on another job cannot record materials here');
select test.assert((select count(*)=0 from public.site_material_records),'a supervisor on another job sees none of these materials');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.assert((select count(*)=2 from public.site_material_records),'the office reads the materials used, without money access');

-- The office (money access) matches them to purchases and invoices.
select id as m1 from public.site_material_records where batch_id=:'batch' and position=1 \gset
select id as m2 from public.site_material_records where batch_id=:'batch' and position=2 \gset
select test.expect_error(format('select public.match_material_cost(gen_random_uuid(),jsonb_build_object(''material_record_id'',%L,''cost_entry_id'',%L))',:'m1',:'cost_materials'),
 array['42501'],'matching needs money access');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.match_material_cost(gen_random_uuid(),jsonb_build_object('material_record_id',:'m1','cost_entry_id',:'cost_materials')) as match1 \gset
select public.match_material_cost(gen_random_uuid(),jsonb_build_object('material_record_id',:'m2','cost_entry_id',:'cost_materials'));
select test.assert((select count(*)=2 from public.material_cost_matches where cost_entry_id=:'cost_materials' and voided_at is null),
 'one invoice covers several materials used');
select test.expect_error(format('select public.match_material_cost(gen_random_uuid(),jsonb_build_object(''material_record_id'',%L,''cost_entry_id'',%L))',:'m1',:'cost_credit'),
 array['22023'],'a material already matched must be unmatched first');
select public.unmatch_material_cost(:'match1','Matched to the wrong delivery');
select public.match_material_cost(gen_random_uuid(),jsonb_build_object('material_record_id',:'m1','cost_entry_id',:'cost_credit'));
select test.assert((select cost_entry_id=:'cost_credit' from public.material_cost_matches where material_record_id=:'m1' and voided_at is null)
 and (select void_reason='Matched to the wrong delivery' from public.material_cost_matches where id=:'match1'),'an unmatch keeps the earlier match on record');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert((select count(*)=0 from public.material_cost_matches),'a supervisor never sees whether or how materials were matched to costs');

-- Corrections are voids with reasons; nothing is rewritten or deleted.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'ellie'),true);
select test.expect_error(format('select public.void_material_record(%L,''Not mine'')',:'m2'),array['42501'],'another supervisor cannot void a material record');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.void_material_record(:'m2','Counted twice');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select test.assert((select voided_at is not null from public.site_material_records where id=:'m2')
 and not exists(select 1 from public.material_cost_matches where material_record_id=:'m2' and voided_at is null),
 'a supervisor voids their own material line, and its match goes with it');
select public.void_job_cost(:'cost_credit','Duplicate credit note');
select test.assert((select voided_at is not null from public.job_cost_entries where id=:'cost_credit')
 and not exists(select 1 from public.material_cost_matches where cost_entry_id=:'cost_credit' and voided_at is null),
 'a voided cost releases its matches');
select test.assert((select count(*)>=6 and bool_and(commercial) from public.audit_events where entity_type in ('labour_cost_rates','job_cost_entries','material_cost_matches')),
 'rates, costs and matches are audited as commercial');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert(not exists(select 1 from public.audit_events where entity_type in ('labour_cost_rates','job_cost_entries','material_cost_matches')),
 'a supervisor sees none of that audit');
reset role;
select test.expect_error(format('update public.job_cost_entries set net_amount=1 where id=%L',:'cost_materials'),array['42501'],'a recorded cost cannot be rewritten');
select test.expect_error(format('delete from public.labour_cost_rates where id=%L',:'r_marek'),array['42501'],'a rate cannot be deleted');
select test.expect_error(format('update public.site_material_records set quantity=99 where id=%L',:'m1'),array['42501'],'a material record cannot be rewritten');
rollback;
