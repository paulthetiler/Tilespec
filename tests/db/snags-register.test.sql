-- Commercial-scale register acceptance: more than one page of genuinely
-- submitted photographic snags, with tenant/site/party boundaries in the data.
-- This transaction and its storage fixtures are disposable local test data.
begin;
insert into auth.users(id,email) values
 ('ae100000-0000-4000-8000-000000000001','register-owner@example.invalid'),
 ('ae100000-0000-4000-8000-000000000002','register-supervisor@example.invalid'),
 ('ae100000-0000-4000-8000-000000000003','register-other-owner@example.invalid'),
 ('ae100000-0000-4000-8000-000000000004','register-installer@example.invalid');
insert into public.organisations(id,name) values
 ('ae200000-0000-4000-8000-000000000001','Register contractor'),
 ('ae200000-0000-4000-8000-000000000002','Different register contractor');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access) values
 ('ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001','Register office','owner',true),
 ('ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000002','Register supervisor','supervisor',false),
 ('ae200000-0000-4000-8000-000000000002','ae100000-0000-4000-8000-000000000003','Other office','owner',true),
 ('ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000004','Register repair installer','subcontract_installer',false);
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 ('ae300000-0000-4000-8000-000000000001','ae200000-0000-4000-8000-000000000001','REG-A','Large authorised site','ae100000-0000-4000-8000-000000000001'),
 ('ae300000-0000-4000-8000-000000000002','ae200000-0000-4000-8000-000000000001','REG-B','Second authorised site','ae100000-0000-4000-8000-000000000001'),
 ('ae300000-0000-4000-8000-000000000003','ae200000-0000-4000-8000-000000000001','REG-HIDDEN','Unassigned site','ae100000-0000-4000-8000-000000000001'),
 ('ae300000-0000-4000-8000-000000000004','ae200000-0000-4000-8000-000000000002','REG-OTHER','Different tenant site','ae100000-0000-4000-8000-000000000003');
insert into public.contract_assignments(contract_id,organisation_id,user_id) values
 ('ae300000-0000-4000-8000-000000000001','ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000002'),
 ('ae300000-0000-4000-8000-000000000002','ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ae100000-0000-4000-8000-000000000001"}',true);
select public.create_locations('ae300000-0000-4000-8000-000000000001',gen_random_uuid(),null,'[{"name":"Register Flat 52","children":[{"name":"Register Bathroom"},{"name":"Register Kitchen"}]}]');
select public.create_locations('ae300000-0000-4000-8000-000000000002',gen_random_uuid(),null,'[{"name":"Register Second Site"}]');
select public.create_locations('ae300000-0000-4000-8000-000000000003',gen_random_uuid(),null,'[{"name":"Register Hidden Site"}]');
select id as flat from public.work_areas where name='Register Flat 52' \gset
select id as bathroom from public.work_areas where name='Register Bathroom' \gset
select id as kitchen from public.work_areas where name='Register Kitchen' \gset
select id as second_location from public.work_areas where name='Register Second Site' \gset
select id as hidden_location from public.work_areas where name='Register Hidden Site' \gset
select public.create_team(gen_random_uuid(),'{"name":"Register repair gang","kind":"direct_team"}') as gang \gset
select public.create_operative(gen_random_uuid(),'{"display_name":"Register operative","engagement":"direct_employee","user_id":"ae100000-0000-4000-8000-000000000004"}') as operative \gset
select public.add_team_member(gen_random_uuid(),jsonb_build_object('team_id',:'gang','operative_id',:'operative','valid_from',private.site_today()::text));
select public.create_work_package(:'bathroom',gen_random_uuid(),'{"name":"Register bathroom package","quantity":10,"unit":"m2"}') as package \gset
insert into public.package_assignments(organisation_id,contract_id,work_package_id,user_id)
 values('ae200000-0000-4000-8000-000000000001','ae300000-0000-4000-8000-000000000001',:'package','ae100000-0000-4000-8000-000000000004');
select set_config('request.jwt.claims','{"sub":"ae100000-0000-4000-8000-000000000003"}',true);
select public.create_locations('ae300000-0000-4000-8000-000000000004',gen_random_uuid(),null,'[{"name":"Register Other Tenant"}]');
select id as other_location from public.work_areas where name='Register Other Tenant' \gset
reset role;

-- Every business mutation goes through its real checked RPC. Only the storage
-- platform's bytes/metadata surface is supplied by this test-only helper.
create function pg_temp.register_fixture(p_contract uuid,p_location uuid,p_number integer,p_critical boolean default false,
 p_assigned_team uuid default null,p_submit boolean default true) returns uuid
language plpgsql security definer set search_path='' as $$
declare snag uuid; photo uuid; p public.supervisor_issue_photos; claims text:=current_setting('request.jwt.claims',true);
begin
 snag:=public.create_snag(gen_random_uuid(),jsonb_build_object('contract_id',p_contract,'work_area_id',p_location,'stage','installation',
  'category','Poor alignment','severity',case when p_critical then 'critical' else 'major' end,
  'description',case when p_number<=3 then 'needlemarker photographed finding ' else 'Ordinary photographed finding ' end||p_number,
  'required_rectification','Realign tiles and submit repair photographs'));
 if not p_submit then return snag; end if;
 photo:=public.reserve_snag_photo(snag,gen_random_uuid(),'original',jsonb_build_object('mime_type','image/png','sha256',repeat('a',64),'bytes',8));
 select * into p from public.supervisor_issue_photos where id=photo;
 insert into storage.objects(bucket_id,name,owner,metadata)
  values('supervisor-evidence',p.object_path,p.actor_id,jsonb_build_object('size',p.bytes,'mimetype',p.mime_type));
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform public.complete_snag_photo(photo,p.actor_id,p.sha256);
 perform set_config('request.jwt.claims',claims,true);
 perform public.transition_snag(snag,gen_random_uuid(),1,'submit',jsonb_build_object('note','Original photographs verified and submitted','photo_ids',jsonb_build_array(photo)));
 if p_assigned_team is not null then
  perform public.transition_snag(snag,gen_random_uuid(),2,'assign',jsonb_build_object('note','Assigned independent repair gang','team_id',p_assigned_team,
   'required_action','Realign tiles','target_date',(private.site_today()-1)::text));
 end if;
 return snag;
end $$;
create temp table register_fixture_ids(id uuid primary key,site text,number integer);
grant select on register_fixture_ids to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ae100000-0000-4000-8000-000000000001"}',true);
reset role;
insert into register_fixture_ids select pg_temp.register_fixture('ae300000-0000-4000-8000-000000000001',
 case when n<=35 then :'bathroom'::uuid else :'kitchen'::uuid end,n,n=55,case when n<=3 then :'gang'::uuid end), 'A',n from generate_series(1,55) n;
insert into register_fixture_ids select pg_temp.register_fixture('ae300000-0000-4000-8000-000000000002',:'second_location',100+n),'B',n from generate_series(1,2) n;
insert into register_fixture_ids select pg_temp.register_fixture('ae300000-0000-4000-8000-000000000003',:'hidden_location',200+n),'hidden',n from generate_series(1,4) n;
insert into register_fixture_ids values(pg_temp.register_fixture('ae300000-0000-4000-8000-000000000001',:'bathroom',999,false,null,false),'draft',1);
select set_config('request.jwt.claims','{"sub":"ae100000-0000-4000-8000-000000000003"}',true);
insert into register_fixture_ids select pg_temp.register_fixture('ae300000-0000-4000-8000-000000000004',:'other_location',300+n),'other',n from generate_series(1,2) n;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ae100000-0000-4000-8000-000000000002"}',true);
select public.snag_register('{}',0)::text as first_page \gset
select public.snag_register('{}',1)::text as second_page \gset
select test.assert(jsonb_array_length(:'first_page'::jsonb->'rows')=50 and jsonb_array_length(:'second_page'::jsonb->'rows')=7
 and (:'first_page'::jsonb->>'total')::integer=57 and (:'second_page'::jsonb->>'total')::integer=57,
 'commercial register returns exactly 50 and 7 rows across two pages with the same exact authorised total');
select test.assert(not exists(select 1 from jsonb_array_elements(:'first_page'::jsonb->'rows') a
 join jsonb_array_elements(:'second_page'::jsonb->'rows') b on a->>'id'=b->>'id')
 and (select count(distinct e->>'id')=57 from jsonb_array_elements((:'first_page'::jsonb->'rows')||(:'second_page'::jsonb->'rows')) e),
 'commercial register pages are disjoint and together contain every authorised snag exactly once');
select test.assert(:'first_page'::jsonb->'rows'->0->>'id'=(select id::text from register_fixture_ids where site='A' and number=55),
 'critical saved findings sort ahead of ordinary findings across the register');
select test.assert(:'first_page'::jsonb=public.snag_register('{}',0) and :'second_page'::jsonb=public.snag_register('{}',1),
 'refreshing unchanged data preserves page contents and ordering');
select test.assert(jsonb_array_length(public.snag_register('{}',2)->'rows')=0 and (public.snag_register('{}',2)->>'total')::integer=57,
 'a page past the final row is empty while retaining the authorised total');
select test.assert((:'first_page'::jsonb->'counts'->>'open')::integer=57 and (:'first_page'::jsonb->'counts'->>'critical')::integer=1
 and (select count(*)=57 from public.supervisor_issues),
 'RLS and register counts exclude unassigned sites, other tenants and another user’s unfinished draft at scale');
select test.assert(not exists(select 1 from jsonb_array_elements((:'first_page'::jsonb->'rows')||(:'second_page'::jsonb->'rows')) e
 join register_fixture_ids f on f.id=(e->>'id')::uuid where f.site in ('hidden','other','draft')),
 'neither page contains an unauthorised-site, cross-tenant or private draft row');
select public.snag_register('{"contract_id":"ae300000-0000-4000-8000-000000000001"}',0)::text as site_page \gset
select test.assert((:'site_page'::jsonb->>'total')::integer=55 and (:'site_page'::jsonb->'counts'->>'open')::integer=55
 and jsonb_array_length(public.snag_register('{"contract_id":"ae300000-0000-4000-8000-000000000001"}',1)->'rows')=5,
 'selected-site pagination and summary counts exclude the second authorised site');
select public.snag_register(jsonb_build_object('contract_id','ae300000-0000-4000-8000-000000000001','location_id',:'flat'),0)::text as flat_page \gset
select public.snag_register(jsonb_build_object('contract_id','ae300000-0000-4000-8000-000000000001','location_id',:'bathroom'),0)::text as bathroom_page \gset
select test.assert((:'flat_page'::jsonb->>'total')::integer=55 and (:'bathroom_page'::jsonb->>'total')::integer=35
 and :'bathroom_page'::jsonb->'counts'=:'site_page'::jsonb->'counts',
 'parent-location filtering includes descendants, a room filter narrows rows and selected-site counts stay complete');
select public.snag_register(jsonb_build_object('contract_id','ae300000-0000-4000-8000-000000000001','search','needlemarker'),0)::text as searched \gset
select test.assert((:'searched'::jsonb->>'total')::integer=3 and jsonb_array_length(:'searched'::jsonb->'rows')=3
 and :'searched'::jsonb->'counts'=:'site_page'::jsonb->'counts',
 'finding search returns matching saved snags without replacing selected-site summary counts');
select public.snag_register(jsonb_build_object('contract_id','ae300000-0000-4000-8000-000000000001','assigned_team_id',:'gang'),0)::text as assigned \gset
select test.assert((:'assigned'::jsonb->>'total')::integer=3
 and not exists(select 1 from jsonb_array_elements(:'assigned'::jsonb->'rows') e where e->>'assigned_team_id'<>:'gang' or e->>'snag_status'<>'assigned')
 and :'assigned'::jsonb->'counts'=:'site_page'::jsonb->'counts' and (:'assigned'::jsonb->'counts'->>'overdue')::integer=3,
 'assignment filtering returns actual saved repair assignments while keeping complete site and overdue counts');
select test.assert((public.snag_register('{"contract_id":"ae300000-0000-4000-8000-000000000003"}',0)->>'total')::integer=0
 and (public.snag_register('{"contract_id":"ae300000-0000-4000-8000-000000000003"}',0)->'counts'->>'open')::integer=0,
 'explicitly filtering an unassigned site leaks neither rows nor summary counts');
select set_config('request.jwt.claims','{"sub":"ae100000-0000-4000-8000-000000000004"}',true);
select public.snag_register('{}',0)::text as installer_page \gset
select test.assert((:'installer_page'::jsonb->>'total')::integer=3 and (:'installer_page'::jsonb->'counts'->>'open')::integer=3
 and (:'installer_page'::jsonb->'counts'->>'overdue')::integer=3 and (:'installer_page'::jsonb->'counts'->>'critical')::integer=0
 and jsonb_array_length(:'installer_page'::jsonb->'rows')=3 and (select count(*)=3 from public.supervisor_issues),
 'an installer sees only three explicitly assigned scoped repairs and counts from those repairs among sixty-plus records');
select test.assert(jsonb_array_length(public.snag_register('{}',1)->'rows')=0 and (public.snag_register('{}',1)->>'total')::integer=3,
 'installer pagination cannot expose remaining supervisor register pages');
select test.expect_error('select public.snag_register(''{}'',-1)',array['22023'],'register rejects a negative page without returning records');
rollback;
