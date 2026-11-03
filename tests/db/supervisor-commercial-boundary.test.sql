-- Supervisor commercial boundary (C1). Disposable database only.
begin;
\set owner 'cb510000-0000-4000-8000-000000000001'
\set dave 'cb510000-0000-4000-8000-000000000002'
\set mia 'cb510000-0000-4000-8000-000000000003'
\set faye 'cb510000-0000-4000-8000-000000000004'
\set ellie 'cb510000-0000-4000-8000-000000000005'
\set org 'cb520000-0000-4000-8000-000000000001'
\set c1 'cb530000-0000-4000-8000-000000000001'
\set c2 'cb530000-0000-4000-8000-000000000002'
insert into auth.users(id,email) select id::uuid,id||'@example.invalid' from unnest(array[:'owner',:'dave',:'mia',:'faye',:'ellie']) id;
insert into public.organisations(id,name) values (:'org','Boundary test');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access)
select :'org',id::uuid,name,role::public.operations_role,money from (values
 (:'owner','Olive Owner','owner',true),(:'dave','Dave Supervisor','supervisor',false),(:'mia','Mia Manager','contracts_manager',false),
 (:'faye','Faye Finance','contracts_manager',true),(:'ellie','Ellie Elsewhere','supervisor',false)) people(id,name,role,money);
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 (:'c1',:'org','CB-1','Boundary site',:'owner'),(:'c2',:'org','CB-2','Other site',:'owner');
insert into public.contract_assignments(organisation_id,contract_id,user_id) values
 (:'org',:'c1',:'dave'),(:'org',:'c1',:'mia'),(:'org',:'c1',:'faye'),(:'org',:'c2',:'ellie');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
insert into public.document_revisions(id,organisation_id,contract_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes,created_by)
values ('cb540000-0000-4000-8000-000000000001',:'org',:'c1','CVI-1',1,'Client instruction 1','operational',
 :'org'||'/'||:'c1'||'/operational/contract/cb540000-0000-4000-8000-000000000001.pdf',repeat('e',64),'application/pdf',10,:'owner');
update public.document_revisions set uploaded_at=now() where id='cb540000-0000-4000-8000-000000000001';
create function test.go(p uuid) returns text language sql stable as $$
  select go_ahead from public.daywork_site_statuses((select array_agg(id) from public.contracts)) where daywork_id=p $$;
grant execute on function test.go(uuid) to authenticated;
set local role authenticated;

select test.assert((select daywork_client_authorisation from public.contracts where id=:'c1'),
 'a contract requires the client''s authorisation for dayworks until the office says otherwise');

-- Dave records and sends a daywork; Mia approves the work.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Extra splashback for the client',
 'instructed_by_name','Sam Site','lines',jsonb_build_array(jsonb_build_object('kind','labour','label','Marek','role','operative',
 'work_date',private.site_today(),'quantity',4)))) as dw \gset
select test.assert(test.go(:'dw')='not_sent','a daywork not yet sent cannot go ahead');
select public.send_daywork(:'dw',gen_random_uuid(),1);
select test.assert(test.go(:'dw')='awaiting_office','a sent daywork waits for the office');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select public.decide_daywork(:'dw',gen_random_uuid(),2,'{"decision":"approve"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert(test.go(:'dw')='awaiting_client','office approval alone is not permission when the contract requires the client''s authorisation');

-- Faye prices it and approves the charge internally: still no go-ahead.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','operative','item','Operative','unit','hour','rate',30)) as rate \gset
select public.price_daywork(:'dw',gen_random_uuid(),3,jsonb_build_object('lines',jsonb_build_array(jsonb_build_object(
 'line_id',(select id from public.daywork_lines where daywork_id=:'dw'),'rate_id',:'rate'))));
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select public.approve_daywork_charge(:'dw',gen_random_uuid(),4,'{}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert(test.go(:'dw')='awaiting_client','internal charge approval never gives permission to proceed');

-- What each person can read.
select test.expect_error(format('select commercial_status from public.dayworks where id=%L',:'dw'),array['42501'],
 'a supervisor cannot read the internal charge status');
select test.expect_error(format('select client_status from public.dayworks where id=%L',:'dw'),array['42501'],
 'a supervisor cannot read the client status column');
select test.expect_error('select * from public.dayworks',array['42501'],'a supervisor cannot read every daywork column at once');
select test.expect_error('select snapshot from public.daywork_events',array['42501'],'a supervisor cannot read history snapshots');
select test.assert((select count(*)=1 from public.dayworks where id=:'dw')
 and (select array_agg(action order by id)=array['record','send','approve'] from public.daywork_events where daywork_id=:'dw'),
 'a supervisor still reads the daywork and its site and office steps');
select test.assert(not exists(select 1 from public.daywork_events where daywork_id=:'dw' and action in ('price','commercial_approval')),
 'a supervisor does not see that it was priced or its charge approved');
select test.assert((select count(*)=0 from public.daywork_office_statuses(array[:'c1'::uuid])),'the office status function returns nothing to a supervisor');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.assert((select client_status='not_authorised' and commercial_status is null from public.daywork_office_statuses(array[:'c1'::uuid]) where daywork_id=:'dw'),
 'an office user without money access sees the client status but not the internal charge status');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select test.assert((select client_status='not_authorised' and commercial_status='commercially_approved' from public.daywork_office_statuses(array[:'c1'::uuid]) where daywork_id=:'dw'),
 'an office user with money access sees both');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'ellie'),true);
select test.assert((select count(*)=0 from public.daywork_site_statuses(array[:'c1'::uuid])),'a supervisor on another job learns nothing about this one');

-- The client authorises it: now it may go ahead. The record and its audit stay with the office.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select public.record_daywork_client_authorisation(:'dw',gen_random_uuid(),'{"outcome":"authorised","client_name":"Main Contractor QS","reference":"CVI-1"}');
select test.assert((select count(*)=1 from public.daywork_client_authorisations where daywork_id=:'dw'),'the office reads the client''s authorisation');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert(test.go(:'dw')='proceed','office approval plus the client''s authorisation means go ahead');
select test.assert((select count(*)=0 from public.daywork_client_authorisations)
 and not exists(select 1 from public.daywork_events where action='client_authorisation')
 and not exists(select 1 from public.audit_events where entity_type='daywork_client_authorisations'
   or (entity_type='dayworks' and action='update' and details->'changed_fields' ?| array['commercial_status','client_status'])),
 'a supervisor sees no client authorisation record, history step or audit row');
select test.assert(exists(select 1 from public.audit_events where entity_type='dayworks' and entity_id=:'dw'),
 'a supervisor still sees the non-commercial audit of the daywork');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.assert(not exists(select 1 from public.audit_events where entity_type='daywork_client_authorisations'),
 'commercial audit of the client''s authorisation needs money access');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select test.assert((select count(*)=1 and bool_and(commercial) from public.audit_events where entity_type='daywork_client_authorisations')
 and (select count(*)>=3 and bool_and(commercial) from public.audit_events where entity_type='dayworks' and entity_id=:'dw'
   and action='update' and details->'changed_fields' ?| array['commercial_status','client_status']),
 'commercial and client status changes are commercial audit rows, readable with money access');

-- The contract's rule is set by the office, versioned and audited.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.expect_error(format('select public.set_extra_work_authorisation(%L,1,''{"dayworks":false}'')',:'c1'),array['42501'],
 'a supervisor cannot change what the contract requires');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.expect_error(format('select public.set_extra_work_authorisation(%L,99,''{"dayworks":false}'')',:'c1'),array['40001'],
 'a stale contract version is refused');
select test.expect_error(format('select public.set_extra_work_authorisation(%L,1,''{"dayworks":"no"}'')',:'c1'),array['22023'],'the answer must be true or false');
select test.expect_error(format('select public.set_extra_work_authorisation(%L,1,''{"dayworks":false,"margin":1}'')',:'c1'),array['22023'],'no other field can be changed');
select public.set_extra_work_authorisation(:'c1',1,'{"dayworks":false}') as c1_version \gset
select test.assert(:'c1_version'::integer=2
 and not (select daywork_client_authorisation from public.contracts where id=:'c1')
 and exists(select 1 from public.audit_events where entity_type='contracts' and entity_id=:'c1' and details->'changed_fields' ? 'daywork_client_authorisation'),
 'the office records that this contract does not need the client''s authorisation for dayworks, and the change is audited');

-- Without that requirement, office approval is enough; internal charge status still plays no part.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Move the tile stack for the scaffolders',
 'instructed_by_name','Sam Site','lines',jsonb_build_array(jsonb_build_object('kind','labour','label','Marek','role','operative',
 'work_date',private.site_today(),'quantity',1)))) as dw2 \gset
select public.send_daywork(:'dw2',gen_random_uuid(),1);
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select public.decide_daywork(:'dw2',gen_random_uuid(),2,'{"decision":"approve"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert(test.go(:'dw2')='proceed','where the contract does not require it, office approval is the go-ahead, before any pricing');

-- A client refusal or an office rejection always stops the work.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select public.record_daywork_client_authorisation(:'dw2',gen_random_uuid(),'{"outcome":"declined","client_name":"Main Contractor QS","note":"Not instructed"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert(test.go(:'dw2')='client_declined','a client refusal stops the work even after office approval');
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Regrout the plant room',
 'instructed_by_name','Sam Site','lines',jsonb_build_array(jsonb_build_object('kind','labour','label','Marek','role','operative',
 'work_date',private.site_today(),'quantity',2)))) as dw3 \gset
select public.send_daywork(:'dw3',gen_random_uuid(),1);
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select public.decide_daywork(:'dw3',gen_random_uuid(),2,'{"decision":"request_detail","note":"Which rooms?"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert(test.go(:'dw3')='more_detail','a daywork sent back for detail cannot go ahead');
select public.send_daywork(:'dw3',gen_random_uuid(),3);
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select public.decide_daywork(:'dw3',gen_random_uuid(),4,'{"decision":"reject","note":"Covered by the contract"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert(test.go(:'dw3')='rejected','a rejected daywork cannot go ahead');

select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select test.expect_error(format('update public.contracts set daywork_client_authorisation=true where id=%L',:'c1'),array['42501'],
 'signed-in users cannot change the contract rule directly, even the owner');
select test.assert(not has_function_privilege('authenticated','private.daywork_go_ahead(public.dayworks)','execute')
 and not has_function_privilege('authenticated','private.client_authorisation_required(uuid,text)','execute'),
 'the go-ahead internals cannot be called directly');
rollback;
