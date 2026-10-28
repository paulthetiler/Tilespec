-- Dayworks and contract day rates (M4). Disposable database only.
begin;
\set owner 'dd510000-0000-4000-8000-000000000001'
\set dave 'dd510000-0000-4000-8000-000000000002'
\set ellie 'dd510000-0000-4000-8000-000000000003'
\set mia 'dd510000-0000-4000-8000-000000000004'
\set faye 'dd510000-0000-4000-8000-000000000005'
\set uma 'dd510000-0000-4000-8000-000000000006'
\set installer 'dd510000-0000-4000-8000-000000000007'
\set outsider 'dd510000-0000-4000-8000-000000000008'
\set org 'dd520000-0000-4000-8000-000000000001'
\set c1 'dd530000-0000-4000-8000-000000000001'
\set c2 'dd530000-0000-4000-8000-000000000002'
insert into auth.users(id,email) select id::uuid,id||'@example.invalid' from unnest(array[:'owner',:'dave',:'ellie',:'mia',:'faye',:'uma',:'installer',:'outsider']) id;
insert into public.organisations(id,name) values (:'org','Dayworks test'),('dd520000-0000-4000-8000-000000000002','Other dayworks test');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access)
select :'org',id::uuid,name,role::public.operations_role,money from (values
 (:'owner','Olive Owner','owner',false),(:'dave','Dave Supervisor','supervisor',false),(:'ellie','Ellie Elsewhere','supervisor',false),
 (:'mia','Mia Manager','contracts_manager',false),(:'faye','Faye Finance','contracts_manager',true),(:'uma','Uma Unassigned','contracts_manager',true),
 (:'installer','Ian Installer','subcontract_installer',false)) people(id,name,role,money);
insert into public.organisation_members(organisation_id,user_id,display_name,role) values ('dd520000-0000-4000-8000-000000000002',:'outsider','Outside owner','owner');
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 (:'c1',:'org','DW-JOB-1','Fictional daywork site',:'owner'),(:'c2',:'org','DW-JOB-2','Second daywork site',:'owner');
insert into public.contract_assignments(organisation_id,contract_id,user_id) values
 (:'org',:'c1',:'dave'),(:'org',:'c1',:'mia'),(:'org',:'c1',:'faye'),(:'org',:'c2',:'ellie'),(:'org',:'c2',:'faye');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
insert into public.document_revisions(id,organisation_id,contract_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes,created_by)
values ('dd540000-0000-4000-8000-000000000001',:'org',:'c1','CVI-12',1,'Client variation instruction 12','operational',
 :'org'||'/'||:'c1'||'/operational/contract/dd540000-0000-4000-8000-000000000001.pdf',repeat('b',64),'application/pdf',10,:'owner');
update public.document_revisions set uploaded_at=now() where id='dd540000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select public.create_locations(:'c1',gen_random_uuid(),null,'[{"name":"Bin store"}]');
select id as bin_store from public.work_areas where name='Bin store' \gset

-- Dave records a daywork on site, with people, plant and materials, and no photograph.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select gen_random_uuid() as key1 \gset
select jsonb_build_object('contract_id',:'c1','work_area_id',:'bin_store','description','Tile the bin store wall for the main contractor',
 'instructed_by_name','Sam Site','instructed_by_company','Main Contractor Ltd','instructed_on',private.site_today(),
 'lines',jsonb_build_array(
   jsonb_build_object('kind','labour','label','Marek','role','operative','work_date',private.site_today(),'quantity',6.5),
   jsonb_build_object('kind','labour','label','Dave','role','supervisor','work_date',private.site_today(),'quantity',1),
   jsonb_build_object('kind','plant','label','Wet saw','unit','day','quantity',1),
   jsonb_build_object('kind','material','label','Adhesive','unit','bag','quantity',3))) as data1 \gset
select public.create_daywork(:'key1',:'data1') as dw1 \gset
select test.assert(public.create_daywork(:'key1',:'data1')=:'dw1'
 and (select number=1 and site_status='recorded' and office_status is null and signoff_status='none' and commercial_status='awaiting_pricing'
   and client_status='not_authorised' and location_path=array['Bin store'] and created_by_name='Dave Supervisor' from public.dayworks where id=:'dw1')
 and (select count(*)=4 from public.daywork_lines where daywork_id=:'dw1' and lines_version=1),
 'a supervisor records a daywork with labour, plant and materials and no photograph, and a safe retry returns the same record');
select test.expect_error(format('select public.create_daywork(%L,%L::jsonb||''{"description":"Something else entirely"}'')',:'key1',:'data1'),array['22023'],
 'a request key cannot be reused for a different daywork');
select test.expect_error(format('select public.create_daywork(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''description'',''Tile'',''instructed_by_name'',''Sam''))',:'c1'),
 array['22023'],'a daywork must say what was done');
select test.expect_error(format('select public.create_daywork(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''description'',''Tile the wall'',''instructed_by_name'',''Sam'',''instructed_on'',private.site_today()+1))',:'c1'),
 array['22023'],'the date it was asked for cannot be in the future');
select test.expect_error(format('select public.create_daywork(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''description'',''Tile the wall'',''instructed_by_name'',''Sam'',
 ''lines'',jsonb_build_array(jsonb_build_object(''kind'',''labour'',''label'',''Marek'',''role'',''operative'',''work_date'',private.site_today(),''quantity'',25))))',:'c1'),
 array['22023'],'one labour line cannot exceed 24 hours');
select test.expect_error(format('select public.create_daywork(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''description'',''Tile the wall'',''instructed_by_name'',''Sam'',
 ''lines'',jsonb_build_array(jsonb_build_object(''kind'',''labour'',''label'',''Marek'',''role'',''operative'',''work_date'',private.site_today(),''quantity'',1,''unit'',''day''))))',:'c1'),
 array['22023'],'labour is recorded in hours');
select test.expect_error(format('select public.create_daywork(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''description'',''Tile the wall'',''instructed_by_name'',''Sam'',
 ''lines'',jsonb_build_array(jsonb_build_object(''kind'',''plant'',''label'',''Saw'',''unit'',''fortnight'',''quantity'',1))))',:'c1'),
 array['22023'],'plant and materials use a known unit');
select test.expect_error(format('select public.create_daywork(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''description'',''Tile the wall'',''instructed_by_name'',''Sam'',
 ''lines'',jsonb_build_array(jsonb_build_object(''kind'',''labour'',''label'',''Marek'',''role'',''operative'',''work_date'',private.site_today()+1,''quantity'',2))))',:'c1'),
 array['22023'],'work dates cannot be in the future');
select test.expect_error(format('select public.create_daywork(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''description'',''Tile the wall'',''instructed_by_name'',''Sam'',''work_area_id'',%L))',:'c2',:'bin_store'),
 array['42501','22023'],'a supervisor cannot record a daywork on a job they are not on, or at another job''s location');
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Clean up after the plasterers',
 'instructed_by_name','Sam Site')) as dw_empty \gset
select test.assert((select number=2 and instructed_on=private.site_today() from public.dayworks where id=:'dw_empty'),
 'dayworks are numbered per job and default to being asked for today');
select test.expect_error(format('select public.send_daywork(%L,gen_random_uuid(),1)',:'dw_empty'),array['22023'],
 'a daywork with no lines cannot be sent to the office');

-- Who can see it.
select test.assert((select count(*)=2 from public.dayworks) and (select count(*)=4 from public.daywork_lines)
 and (select count(*)=2 from public.daywork_events where action='record'),'the supervisor on the job sees its dayworks, lines and history');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.assert((select count(*)=2 from public.dayworks),'the office for the job sees its dayworks');
do $$ declare person text; begin
  foreach person in array array['dd510000-0000-4000-8000-000000000003','dd510000-0000-4000-8000-000000000006','dd510000-0000-4000-8000-000000000007','dd510000-0000-4000-8000-000000000008'] loop
    perform set_config('request.jwt.claims',format('{"sub":"%s"}',person),true);
    if exists(select 1 from public.dayworks) or exists(select 1 from public.daywork_lines) or exists(select 1 from public.daywork_events) then
      raise exception 'FAIL: % can see dayworks',person; end if;
  end loop;
end $$;
select test.assert(true,'supervisors and office staff not on the job, installers and other organisations see no dayworks');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'ellie'),true);
select test.expect_error(format('select public.send_daywork(%L,gen_random_uuid(),1)',:'dw1'),array['42501'],'a supervisor on another job cannot send this daywork');

-- The client's representative signs the record of the work, or refuses, or is not there.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.expect_error(format('select public.record_daywork_signoff(%L,gen_random_uuid(),''{"outcome":"signed"}'')',:'dw1'),array['22023'],
 'a signature needs the name of the person who signed');
select test.expect_error(format('select public.record_daywork_signoff(%L,gen_random_uuid(),''{"outcome":"refused","signer_name":"Sam Site"}'')',:'dw1'),array['22023'],
 'a refused signature needs a reason');
select public.record_daywork_signoff(:'dw1',gen_random_uuid(),jsonb_build_object('outcome','refused','signer_name','Sam Site','reason','Wants to check with his manager first')) as refused \gset
select public.record_daywork_signoff(:'dw1',gen_random_uuid(),jsonb_build_object('outcome','signed','signer_name','Sam Site','signer_position','Site manager',
 'signer_company','Main Contractor Ltd','signed_at',to_jsonb(now())#>>'{}')) as signed \gset
select test.assert((select signoff_status='signed' and office_status is null and client_status='not_authorised' from public.dayworks where id=:'dw1')
 and (select count(*)=2 from public.daywork_signoffs where daywork_id=:'dw1'),
 'a refusal is kept, a later signature is recorded, and signing neither sends it nor authorises payment');

-- Dave sends it; the office reviews it.
select version as v from public.dayworks where id=:'dw1' \gset
select test.expect_error(format('select public.send_daywork(%L,gen_random_uuid(),%s)',:'dw1',:v - 1),array['40001'],'a stale screen cannot send a daywork');
select gen_random_uuid() as send_key \gset
select public.send_daywork(:'dw1',:'send_key',:v);
select test.assert(public.send_daywork(:'dw1',:'send_key',:v)=:'dw1'
 and (select site_status='sent' and office_status='awaiting_review' from public.dayworks where id=:'dw1'),
 'sending puts the daywork in front of the office, and a retry is safe');
select version as v from public.dayworks where id=:'dw1' \gset
select test.expect_error(format('select public.save_daywork_lines(%L,gen_random_uuid(),%s,''{"lines":[{"kind":"plant","label":"Mixer","unit":"day","quantity":1}]}'')',:'dw1',:v),
 array['22023'],'lines cannot be changed while the office is reviewing them');
select test.expect_error(format('select public.decide_daywork(%L,gen_random_uuid(),%s,''{"decision":"approve"}'')',:'dw1',:v),array['42501'],
 'a supervisor cannot approve a daywork');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.expect_error(format('select public.decide_daywork(%L,gen_random_uuid(),%s,''{"decision":"request_detail"}'')',:'dw1',:v),array['22023'],
 'asking for more detail says what is needed');
select public.decide_daywork(:'dw1',gen_random_uuid(),:v,'{"decision":"request_detail","note":"Which day was the saw on site?"}');
select test.assert((select office_status='more_detail' and site_status='recorded' from public.dayworks where id=:'dw1'),
 'asking for more detail sends the daywork back to site');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select version as v from public.dayworks where id=:'dw1' \gset
select public.save_daywork_lines(:'dw1',gen_random_uuid(),:v,jsonb_build_object('lines',jsonb_build_array(
   jsonb_build_object('kind','labour','label','Marek','role','operative','work_date',private.site_today(),'quantity',6.5),
   jsonb_build_object('kind','labour','label','Dave','role','supervisor','work_date',private.site_today(),'quantity',1),
   jsonb_build_object('kind','plant','label','Wet saw','unit','day','quantity',1,'work_date',private.site_today()),
   jsonb_build_object('kind','material','label','Adhesive','unit','bag','quantity',3))));
select test.assert((select lines_version=2 from public.dayworks where id=:'dw1')
 and (select count(*)=4 from public.daywork_lines where daywork_id=:'dw1' and lines_version=1)
 and (select count(*)=4 from public.daywork_lines where daywork_id=:'dw1' and lines_version=2),
 'a correction saves a new set of lines and keeps the earlier set');
select version as v from public.dayworks where id=:'dw1' \gset
select public.send_daywork(:'dw1',gen_random_uuid(),:v);
select version as v from public.dayworks where id=:'dw1' \gset
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select public.decide_daywork(:'dw1',gen_random_uuid(),:v,'{"decision":"approve"}');
select test.assert((select office_status='approved' and commercial_status='awaiting_pricing' and client_status='not_authorised' from public.dayworks where id=:'dw1'),
 'the office approves the work; the charge and the client''s authorisation stay separate');

-- Nobody approves their own daywork; the owner may, with a logged reason.
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Mia logs a phoned-in daywork','instructed_by_name','Sam Site',
 'lines',jsonb_build_array(jsonb_build_object('kind','material','label','Grout','unit','bag','quantity',2)))) as dw_mia \gset
select public.send_daywork(:'dw_mia',gen_random_uuid(),1);
select test.expect_error(format('select public.decide_daywork(%L,gen_random_uuid(),2,''{"decision":"approve"}'')',:'dw_mia'),array['42501'],
 'an office user cannot approve a daywork they recorded');
select test.expect_error(format('select public.decide_daywork(%L,gen_random_uuid(),2,''{"decision":"approve","override_reason":"I am sure"}'')',:'dw_mia'),array['42501'],
 'only the owner can override, so a manager''s reason does not help');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select test.expect_error(format('select public.decide_daywork(%L,gen_random_uuid(),2,''{"decision":"approve","override_reason":"Not mine"}'')',:'dw_mia'),array['22023'],
 'an override reason is only for approving your own daywork');
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Owner records extra cleaning','instructed_by_name','Sam Site',
 'lines',jsonb_build_array(jsonb_build_object('kind','labour','label','Olive','role','supervisor','work_date',private.site_today(),'quantity',2)))) as dw_owner \gset
select public.send_daywork(:'dw_owner',gen_random_uuid(),1);
select test.expect_error(format('select public.decide_daywork(%L,gen_random_uuid(),2,''{"decision":"approve"}'')',:'dw_owner'),array['22023'],
 'the owner must give a reason to approve their own daywork');
select public.decide_daywork(:'dw_owner',gen_random_uuid(),2,'{"decision":"approve","override_reason":"Only office user today; checked against the site diary"}');
select test.assert((select owner_override and note='Only office user today; checked against the site diary' and actor_name='Olive Owner'
  from public.daywork_events where daywork_id=:'dw_owner' and action='approve'),'an owner override is logged with its reason');

-- Rates and pricing: money access only.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.expect_error(format('select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''category'',''operative'',''item'',''Tiler'',''rate'',30))',:'c1'),
 array['42501'],'an office user without money access cannot set rates');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','operative','item','Tiler','rate',30)) as r_op \gset
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','supervisor','item','Supervisor','unit','day','rate',42.5)) as r_sup \gset
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','plant','item','Wet saw','unit','day','rate',85)) as r_saw \gset
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','material','item','Adhesive','unit','bag','rate',12.5)) as r_adh \gset
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'c2','category','plant','item','Wet saw','unit','day','rate',70)) as r_other_job \gset
select test.assert((select unit='hour' from public.contract_daywork_rates where id=:'r_sup'),'labour rates are always per hour');
select test.expect_error(format('select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''category'',''plant'',''item'',''wet SAW'',''unit'',''day'',''rate'',90))',:'c1'),
 array['22023'],'a job has one current rate per item and unit');
select test.expect_error(format('select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''category'',''plant'',''item'',''Skip'',''unit'',''each'',''rate'',10.005))',:'c1'),
 array['22023'],'a rate has at most two decimal places');

select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert((select count(*)=0 from public.contract_daywork_rates) and (select count(*)=0 from public.daywork_pricings),
 'a supervisor cannot read rates or prices');
select test.assert((select jsonb_array_length(items)=4 and not exists(select 1 from jsonb_array_elements(items) e where e ? 'rate')
  from (select public.daywork_rate_items(:'c1') items) x),'a supervisor sees which items have rates, never the rates themselves');
select version as v from public.dayworks where id=:'dw1' \gset
select test.expect_error(format('select public.price_daywork(%L,gen_random_uuid(),%s,''{"lines":[]}'')',:'dw1',:v),array['42501'],'a supervisor cannot price a daywork');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.assert((select count(*)=0 from public.contract_daywork_rates),'an office user without money access cannot read rates');
select test.expect_error(format('select public.price_daywork(%L,gen_random_uuid(),%s,''{"lines":[]}'')',:'dw1',:v),array['42501'],
 'an office user without money access cannot price a daywork');

select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select coalesce(jsonb_agg(jsonb_build_object('line_id',l.id,'rate_id',case l.kind when 'labour' then case l.role when 'operative' then :'r_op' else :'r_sup' end
  when 'plant' then :'r_saw' else :'r_adh' end) order by l.position),'[]') as mapping
 from public.daywork_lines l where l.daywork_id=:'dw1' and l.lines_version=2 \gset
select test.expect_error(format('select public.price_daywork(%L,gen_random_uuid(),%s,jsonb_build_object(''lines'',(%L::jsonb)-0))',:'dw1',:v,:'mapping'),array['22023'],
 'every line needs a rate before the daywork is priced');
select test.expect_error(format('select public.price_daywork(%L,gen_random_uuid(),%s,jsonb_build_object(''lines'',jsonb_set(%L::jsonb,''{2,rate_id}'',to_jsonb(%L::text))))',:'dw1',:v,:'mapping',:'r_adh'),
 array['22023'],'a line is priced only at a rate of the same kind and unit');
select test.expect_error(format('select public.price_daywork(%L,gen_random_uuid(),%s,jsonb_build_object(''lines'',jsonb_set(%L::jsonb,''{2,rate_id}'',to_jsonb(%L::text))))',:'dw1',:v,:'mapping',:'r_other_job'),
 array['40001'],'a rate from another job cannot be used');
select public.price_daywork(:'dw1',gen_random_uuid(),:v,jsonb_build_object('lines',:'mapping'::jsonb)) as pricing1 \gset
select test.assert((select total=6.5*30+1*42.5+85+3*12.5 from public.daywork_pricings where id=:'pricing1')
 and (select count(*)=4 and bool_and(amount=round(quantity*rate,2)) from public.daywork_pricing_lines where pricing_id=:'pricing1')
 and (select commercial_status='priced' from public.dayworks where id=:'dw1'),
 'pricing works out each line from the job''s rates and keeps the total');

-- The largest allowed line (100,000 units at £100,000) prices without overflowing.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Bulk material at the largest allowed size','instructed_by_name','Sam Site',
 'lines',jsonb_build_array(jsonb_build_object('kind','material','label','Bulk aggregate','unit','tonne','quantity',100000),
   jsonb_build_object('kind','material','label','Bulk aggregate','unit','tonne','quantity',100000)))) as dw_large \gset
select public.send_daywork(:'dw_large',gen_random_uuid(),1);
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','category','material','item','Bulk aggregate','unit','tonne','rate',100000)) as r_large \gset
select coalesce(jsonb_agg(jsonb_build_object('line_id',id,'rate_id',:'r_large')),'[]') as large_mapping from public.daywork_lines where daywork_id=:'dw_large' \gset
select public.price_daywork(:'dw_large',gen_random_uuid(),2,jsonb_build_object('lines',:'large_mapping'::jsonb)) as large_price \gset
select test.assert((select total=20000000000 from public.daywork_pricings where id=:'large_price')
 and (select bool_and(amount=10000000000) from public.daywork_pricing_lines where pricing_id=:'large_price'),
 'the largest allowed lines and totals are stored exactly, without overflow');

-- A later rate change never alters a price already worked out.
select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','supersedes_id',:'r_op','rate',35)) as r_op2 \gset
select test.assert((select rate=30 and rate_id=:'r_op' from public.daywork_pricing_lines where pricing_id=:'pricing1' and category='operative')
 and (select total=6.5*30+1*42.5+85+3*12.5 from public.daywork_pricings where id=:'pricing1')
 and (select rate=30 from public.contract_daywork_rates where id=:'r_op'),
 'a new rate leaves the earlier rate and the price worked out with it exactly as they were');
select test.expect_error(format('select public.save_daywork_rate(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''supersedes_id'',%L,''rate'',36))',:'c1',:'r_op'),
 array['40001'],'a rate that has already been changed cannot be changed again from an old screen');

-- TileSPEC's internal approval of the charge.
select version as v from public.dayworks where id=:'dw1' \gset
select version as owner_v from public.dayworks where id=:'dw_owner' \gset
select test.expect_error(format('select public.approve_daywork_charge(%L,gen_random_uuid(),%s,''{}'')',:'dw_owner',:owner_v),array['22023'],
 'a charge cannot be approved before it is priced');
select public.approve_daywork_charge(:'dw1',gen_random_uuid(),:v,'{"note":"Checked against the site diary"}') as approval1 \gset
select test.assert((select commercial_status='commercially_approved' and client_status='not_authorised' from public.dayworks where id=:'dw1')
 and (select pricing_id=:'pricing1' and not owner_override from public.daywork_commercial_approvals where id=:'approval1'),
 'the charge is approved internally against the exact price, and the client is still not recorded as agreeing to pay');
select version as v from public.dayworks where id=:'dw1' \gset
select test.expect_error(format('select public.price_daywork(%L,gen_random_uuid(),%s,jsonb_build_object(''lines'',%L::jsonb))',:'dw1',:v,:'mapping'),array['22023'],
 'an approved charge cannot be priced again');
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Faye records a phoned-in daywork','instructed_by_name','Sam Site',
 'lines',jsonb_build_array(jsonb_build_object('kind','material','label','Adhesive','unit','bag','quantity',1)))) as dw_faye \gset
select public.send_daywork(:'dw_faye',gen_random_uuid(),1);
select id as faye_line from public.daywork_lines where daywork_id=:'dw_faye' \gset
select public.price_daywork(:'dw_faye',gen_random_uuid(),2,jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('line_id',:'faye_line','rate_id',:'r_adh'))));
select test.expect_error(format('select public.approve_daywork_charge(%L,gen_random_uuid(),3,''{}'')',:'dw_faye'),array['22023'],
 'a charge cannot be approved before the office approves the work');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select public.decide_daywork(:'dw_faye',gen_random_uuid(),3,'{"decision":"approve"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select test.expect_error(format('select public.approve_daywork_charge(%L,gen_random_uuid(),4,''{}'')',:'dw_faye'),array['42501'],
 'nobody approves the charge on a daywork they submitted');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select public.approve_daywork_charge(:'dw_faye',gen_random_uuid(),4,'{}');
select test.assert((select commercial_status='commercially_approved' from public.dayworks where id=:'dw_faye'),'another person with money access approves it');

-- Changing lines after pricing needs a new price.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Extra grout to the stair','instructed_by_name','Sam Site',
 'lines',jsonb_build_array(jsonb_build_object('kind','material','label','Adhesive','unit','bag','quantity',2)))) as dw_reprice \gset
select public.send_daywork(:'dw_reprice',gen_random_uuid(),1);
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select id as reprice_line from public.daywork_lines where daywork_id=:'dw_reprice' \gset
select public.price_daywork(:'dw_reprice',gen_random_uuid(),2,jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('line_id',:'reprice_line','rate_id',:'r_adh'))));
select public.decide_daywork(:'dw_reprice',gen_random_uuid(),3,'{"decision":"request_detail","note":"How many bags exactly?"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.save_daywork_lines(:'dw_reprice',gen_random_uuid(),4,'{"lines":[{"kind":"material","label":"Adhesive","unit":"bag","quantity":4}]}');
select test.assert((select commercial_status='awaiting_pricing' and lines_version=2 from public.dayworks where id=:'dw_reprice')
 and (select count(*)=1 from public.daywork_events where daywork_id=:'dw_reprice' and action='price'),
 'changing the lines after pricing puts the daywork back to awaiting pricing and keeps the earlier price on record');

-- The client's commercial authorisation, separate from the signature and the office approval.
select test.expect_error(format('select public.record_daywork_client_authorisation(%L,gen_random_uuid(),''{"outcome":"authorised","client_name":"Pat Client"}'')',:'dw1'),array['42501'],
 'a supervisor cannot record the client''s authorisation');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.expect_error(format('select public.record_daywork_client_authorisation(%L,gen_random_uuid(),''{"outcome":"authorised","client_name":"Pat Client"}'')',:'dw1'),array['22023'],
 'a client authorisation needs an instruction reference or a document');
select test.expect_error(format('select public.record_daywork_client_authorisation(%L,gen_random_uuid(),''{"outcome":"declined","client_name":"Pat Client"}'')',:'dw1'),array['22023'],
 'a client refusal says why');
select test.expect_error(format('select public.record_daywork_client_authorisation(%L,gen_random_uuid(),jsonb_build_object(''outcome'',''authorised'',''client_name'',''Pat Client'',''document_id'',gen_random_uuid()))',:'dw1'),
 array['22023'],'the evidence must be a document saved on this job');
select public.record_daywork_client_authorisation(:'dw1',gen_random_uuid(),jsonb_build_object('outcome','authorised','client_name','Pat Client',
 'reference','CVI-12','document_id','dd540000-0000-4000-8000-000000000001')) as client1 \gset
select test.assert((select client_status='authorised' and commercial_status='commercially_approved' and signoff_status='signed' from public.dayworks where id=:'dw1')
 and (select reference='CVI-12' and recorded_by_name='Mia Manager' from public.daywork_client_authorisations where id=:'client1'),
 'the client''s authorisation is recorded with its reference and evidence, alongside the separate site and internal statuses');

-- Rejected dayworks stop there.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.create_daywork(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','description','Duplicate of DW-1','instructed_by_name','Sam Site',
 'lines',jsonb_build_array(jsonb_build_object('kind','material','label','Adhesive','unit','bag','quantity',1)))) as dw_reject \gset
select public.send_daywork(:'dw_reject',gen_random_uuid(),1);
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.expect_error(format('select public.decide_daywork(%L,gen_random_uuid(),2,''{"decision":"reject"}'')',:'dw_reject'),array['22023'],'a rejection says why');
select public.decide_daywork(:'dw_reject',gen_random_uuid(),2,'{"decision":"reject","note":"Already recorded as DW-1"}');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.expect_error(format('select public.record_daywork_signoff(%L,gen_random_uuid(),''{"outcome":"signed","signer_name":"Sam"}'')',:'dw_reject'),array['22023'],
 'a rejected daywork takes no signature');
select test.expect_error(format('select public.reserve_daywork_photo(%L,gen_random_uuid(),''work'',jsonb_build_object(''mime_type'',''image/jpeg'',''sha256'',repeat(''c'',64),''bytes'',10))',:'dw_reject'),
 array['42501'],'a rejected daywork takes no photograph');

-- Photographs are optional and verified by the trusted server.
select public.reserve_daywork_photo(:'dw1',gen_random_uuid(),'work',jsonb_build_object('mime_type','image/jpeg','sha256',repeat('d',64),'bytes',10)) as photo \gset
select test.assert((select uploaded_at is null and object_path like :'org'||'/dayworks/'||:'dw1'||'/%.jpg' from public.daywork_photos where id=:'photo'),
 'a photograph is reserved at a checked path and stays unconfirmed until verified');
select test.expect_error(format('select public.complete_daywork_photo(%L,%L,repeat(''d'',64))',:'photo',:'dave'),array['42501'],
 'only the trusted server can confirm a photograph');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.assert((select count(*)=0 from public.daywork_photos where id=:'photo'),'an unconfirmed photograph is visible only to the person who took it');

-- Supervisors see statuses and history, never money.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select test.assert((select commercial_status='commercially_approved' from public.dayworks where id=:'dw1')
 and (select count(*)=0 from public.daywork_commercial_approvals) and (select count(*)=0 from public.daywork_pricing_lines)
 and not exists(select 1 from public.daywork_events where snapshot ?| array['total','rate','amount'])
 and not exists(select 1 from public.audit_events where entity_type in ('contract_daywork_rates','daywork_pricings','daywork_pricing_lines','daywork_commercial_approvals')),
 'a supervisor sees that the charge was approved but no rate, price, total or money audit');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'mia'),true);
select test.assert(not exists(select 1 from public.audit_events where entity_type in ('contract_daywork_rates','daywork_pricings','daywork_pricing_lines','daywork_commercial_approvals')),
 'an office user without money access cannot read money audit either');
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'faye'),true);
select test.assert((select count(*)>0 and bool_and(commercial) from public.audit_events where entity_type in ('contract_daywork_rates','daywork_pricings')),
 'money changes are audited as commercial and readable with money access');

-- Conversations (M1) can be about a daywork.
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'dave'),true);
select public.post_job_message(gen_random_uuid(),jsonb_build_object('contract_id',:'c1','about_type','daywork','about_id',:'dw1',
 'body','Can we bill the saw for a full day?','needs_answer',true)) as about_dw \gset
select test.assert((select about_type='daywork' and about_id=:'dw1' from public.job_messages where id=:'about_dw'),'a supervisor can ask the office about a daywork');
select test.expect_error(format('select public.post_job_message(gen_random_uuid(),jsonb_build_object(''contract_id'',%L,''about_type'',''daywork'',''about_id'',%L,''body'',''Wrong job''))',:'c2',:'dw1'),
 array['22023','42501'],'a conversation about a daywork must be on its own job');

-- History and permanence.
select test.assert((select array_agg(action order by id)=array['record','sign_off','sign_off','send','request_detail','update_lines','send','approve','price','commercial_approval','client_authorisation']
  from public.daywork_events where daywork_id=:'dw1'),'every step is in the daywork''s history, in order');
reset role;
select test.expect_error(format('update public.dayworks set description=''Rewritten'' where id=%L',:'dw1'),array['42501'],'the recorded facts of a daywork cannot be rewritten');
select test.expect_error(format('delete from public.dayworks where id=%L',:'dw1'),array['42501'],'a daywork cannot be deleted');
select test.expect_error(format('update public.daywork_lines set quantity=99 where daywork_id=%L',:'dw1'),array['42501'],'lines cannot be rewritten');
select test.expect_error(format('update public.contract_daywork_rates set rate=1 where id=%L',:'r_op'),array['42501'],'a saved rate cannot be rewritten');
select test.expect_error(format('update public.daywork_pricing_lines set rate=1 where pricing_id=%L',:'pricing1'),array['42501'],'a saved price cannot be rewritten');
select test.expect_error(format('delete from public.daywork_signoffs where daywork_id=%L',:'dw1'),array['42501'],'a sign-off cannot be deleted');
set local role authenticated;
select set_config('request.jwt.claims',format('{"sub":"%s"}',:'owner'),true);
select test.expect_error(format('update public.dayworks set office_status=''approved'' where id=%L',:'dw_reprice'),array['42501'],
 'statuses change only through the checked functions, even for the owner');
rollback;
