-- Variations (C2) on the daywork workflow. Disposable database only.
begin;
\set owner 'c2510000-0000-4000-8000-000000000001'
\set dave 'c2510000-0000-4000-8000-000000000002'
\set mia 'c2510000-0000-4000-8000-000000000003'
\set faye 'c2510000-0000-4000-8000-000000000004'
\set org 'c2520000-0000-4000-8000-000000000001'
\set c1 'c2530000-0000-4000-8000-000000000001'
insert into auth.users(id,email) select id::uuid,id||'@example.invalid' from unnest(array[:'owner',:'dave',:'mia',:'faye']) id;
insert into public.organisations(id,name) values (:'org','Variations test');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access)
select :'org',id::uuid,name,role::public.operations_role,money from (values
 (:'owner','Olive Owner','owner',true),(:'dave','Dave Supervisor','supervisor',false),(:'mia','Mia Manager','contracts_manager',false),
 (:'faye','Faye Finance','contracts_manager',true)) people(id,name,role,money);
insert into public.contracts(id,organisation_id,reference,name,created_by) values (:'c1',:'org','VO-1','Variation site',:'owner');
insert into public.contract_assignments(organisation_id,contract_id,user_id) values (:'org',:'c1',:'dave'),(:'org',:'c1',:'mia'),(:'org',:'c1',:'faye');
create function test.vo(p_id uuid) returns public.dayworks language sql stable security definer set search_path='' as $$
  select * from public.dayworks where id=p_id $$;
grant execute on function test.vo(uuid) to authenticated;
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);

select test.assert((select variation_client_authorisation from public.contracts where id=:'c1'),
 'a contract requires the client''s authorisation for variations until the office says otherwise');

-- Dave raises a variation before any work, with no people or materials, and a daywork for comparison.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','kind','variation',
 'description','Client wants the shower wall tiled to full height instead of 1.2 m','instructed_by_name','Sam Site','instructed_by_company','Main Contractor Ltd')) as vo1 \gset
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Move pallets for the scaffolders',
 'instructed_by_name','Sam Site','lines',jsonb_build_array(jsonb_build_object('kind','labour','label','Marek','role','operative','work_date',private.site_today(),'quantity',1)))) as dw1 \gset
select test.assert((select kind='variation' and number=1 from public.dayworks where id=:'vo1') and (select kind='daywork' and number=1 from public.dayworks where id=:'dw1'),
 'variations and dayworks are numbered separately on the same job, and the supervisor reads which is which');
select test.expect_error(format('select public.create_daywork(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''kind'',''extra'',''description'',''Something else'',''instructed_by_name'',''Sam''))',:'c1'),
 array['22023'],'only a daywork or a variation can be recorded');
select test.expect_error(format('select public.create_daywork(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''kind'',''variation'',''description'',''Tile'',''instructed_by_name'',''Sam''))',:'c1'),
 array['22023'],'a variation must say what needs to change');
select public.send_daywork(:'vo1',gen_random_uuid(),1) as vo1_sent \gset
select test.assert(:'vo1_sent'=:'vo1' and (select site_status='sent' and office_status='awaiting_review' from public.dayworks where id=:'vo1'),
 'a variation can be sent for approval before anyone has worked on it');
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Clean up after plasterers','instructed_by_name','Sam Site')) as dw_empty \gset
select test.expect_error(format('select public.send_daywork(%L,gen_random_uuid(),1)',:'dw_empty'),array['22023'],'a daywork still needs its people, plant or materials before it is sent');
select test.assert((select go_ahead='awaiting_office' from public.daywork_site_statuses(array[:'c1'::uuid]) where daywork_id=:'vo1'),'a raised variation waits for the office');

-- The office approves it. Without the client's authorisation it still may not go ahead.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select public.decide_daywork(:'vo1',gen_random_uuid(),2,'{"decision":"approve"}');
select test.assert((select client_authorisation_required and commercial_status is null from public.daywork_office_statuses(array[:'c1'::uuid]) where daywork_id=:'vo1'),
 'the office sees that this variation needs the client''s authorisation; without money access it sees no charge status');
select test.expect_error(format('select public.price_daywork(%L,gen_random_uuid(),3,''{"method":"quoted","total":1250.5}'')',:'vo1'),array['42501'],
 'pricing a variation needs money access');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert((select go_ahead='awaiting_client' from public.daywork_site_statuses(array[:'c1'::uuid]) where daywork_id=:'vo1'),
 'an approved variation waits for the client''s authorisation');

-- Faye prices it as a quoted sum, and the owner approves the charge: still no go-ahead.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select test.expect_error(format('select public.price_daywork(%L,gen_random_uuid(),3,''{"method":"quoted","total":0}'')',:'vo1'),array['22023'],'a quoted price must be more than nothing');
select test.expect_error(format('select public.price_daywork(%L,gen_random_uuid(),3,''{"method":"quoted","total":10.123}'')',:'vo1'),array['22023'],'a quoted price has at most two decimal places');
select test.expect_error(format('select public.price_daywork(%L,gen_random_uuid(),3,''{"method":"quoted","total":100,"lines":[]}'')',:'vo1'),array['22023'],'a quoted price has no rate lines');
select test.expect_error(format('select public.price_daywork(%L,gen_random_uuid(),3,''{"method":"guess","total":100}'')',:'vo1'),array['22023'],'only day rates or a quoted price');
select public.price_daywork(:'vo1',gen_random_uuid(),3,'{"method":"quoted","total":1250.5,"note":"Quotation Q-12 to the main contractor"}') as vo_price \gset
select test.assert((select method='quoted' and total=1250.50 and note='Quotation Q-12 to the main contractor' and priced_by_name='Faye Finance'
   from public.daywork_pricings where id=:'vo_price') and not exists(select 1 from public.daywork_pricing_lines where pricing_id=:'vo_price'),
 'a variation is priced as a quoted sum, with its reference, and no rate lines');
select test.expect_error(format('select public.price_daywork(%L,gen_random_uuid(),1,''{"method":"quoted","total":100}'')',:'dw_empty'),array['22023','40001'],
 'a daywork cannot be priced as a quoted sum');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select public.approve_daywork_charge(:'vo1',gen_random_uuid(),4,'{}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert((select go_ahead='awaiting_client' from public.daywork_site_statuses(array[:'c1'::uuid]) where daywork_id=:'vo1'),
 'internal approval of a variation''s price is never permission to proceed');
select test.assert((select count(*)=0 from public.daywork_pricings) and not exists(select 1 from public.daywork_events where action in ('price','commercial_approval')),
 'a supervisor never sees a variation''s price or that it was priced');

-- The client authorises it: now it may go ahead.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select public.record_daywork_client_authorisation(:'vo1',gen_random_uuid(),'{"outcome":"authorised","client_name":"Main Contractor QS","reference":"VI-7"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert((select go_ahead='proceed' from public.daywork_site_statuses(array[:'c1'::uuid]) where daywork_id=:'vo1'),
 'office approval and the client''s authorisation mean the variation may go ahead');

-- The variation and daywork requirements are separate settings.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.expect_error(format('select public.set_extra_work_authorisation(%L,1,''{}'')',:'c1'),array['22023'],'the office must say what the contract requires');
select public.set_extra_work_authorisation(:'c1',1,'{"variations":false}') as c1_version \gset
select test.assert(:'c1_version'::integer=2 and (select daywork_client_authorisation and not variation_client_authorisation from public.contracts where id=:'c1'),
 'the office records that variations on this job need only its approval, leaving dayworks unchanged');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','kind','variation','description','Swap the trim colour to brushed steel',
 'instructed_by_name','Sam Site')) as vo2 \gset
select public.send_daywork(:'vo2',gen_random_uuid(),1);
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select public.decide_daywork(:'vo2',gen_random_uuid(),2,'{"decision":"approve"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert((select number=2 from public.dayworks where id=:'vo2')
 and (select go_ahead='proceed' from public.daywork_site_statuses(array[:'c1'::uuid]) where daywork_id=:'vo2'),
 'where the contract does not require it, the office''s approval of a variation is the go-ahead');

-- A daywork priced from rates still works exactly as before.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.send_daywork(:'dw1',gen_random_uuid(),1);
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','operative','item','Operative','unit','hour','rate',32)) as rate \gset
select test.expect_error(format('select public.price_daywork(%L,gen_random_uuid(),2,jsonb_build_object(''lines'',jsonb_build_array(jsonb_build_object(''line_id'',%L,''rate_id'',%L)),''total'',5))',
 :'dw1',(select id from public.daywork_lines where daywork_id=:'dw1'),:'rate'),array['22023'],'a price from day rates is worked out, not typed in');
select public.price_daywork(:'dw1',gen_random_uuid(),2,jsonb_build_object('lines',jsonb_build_array(jsonb_build_object(
 'line_id',(select id from public.daywork_lines where daywork_id=:'dw1'),'rate_id',:'rate')))) as dw_price \gset
select test.assert((select method='day_rates' and total=32 and note is null from public.daywork_pricings where id=:'dw_price'),'a daywork is priced from the job''s day rates');

-- The kind of a record never changes.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select test.expect_error(format('update public.dayworks set kind=''daywork'' where id=%L',:'vo1'),array['42501'],'signed-in users cannot change a record''s kind');
reset role;
select test.expect_error(format('update public.dayworks set kind=''daywork'' where id=%L',:'vo1'),array['42501'],'a variation can never be turned into a daywork, even by trusted SQL');
rollback;
