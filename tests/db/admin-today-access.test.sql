-- Office/Owner Today reads the existing RLS-protected records as its caller.
-- These are synthetic fixtures in the runner's disposable database, not a
-- migration or a grant of new authority. No policy/function is replaced here.
begin;
insert into auth.users(id,email) values
 ('ad310000-0000-4000-8000-000000000001','today-owner@example.invalid'),
 ('ad310000-0000-4000-8000-000000000002','today-office@example.invalid'),
 ('ad310000-0000-4000-8000-000000000003','today-finance@example.invalid'),
 ('ad310000-0000-4000-8000-000000000004','today-supervisor@example.invalid'),
 ('ad310000-0000-4000-8000-000000000005','today-inactive@example.invalid'),
 ('ad310000-0000-4000-8000-000000000006','today-other-owner@example.invalid');
insert into public.organisations(id,name) values
 ('ad320000-0000-4000-8000-000000000001','Today access contractor'),
 ('ad320000-0000-4000-8000-000000000002','Other Today contractor');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access) values
 ('ad320000-0000-4000-8000-000000000001','ad310000-0000-4000-8000-000000000001','Today Owner','owner',false),
 ('ad320000-0000-4000-8000-000000000001','ad310000-0000-4000-8000-000000000002','Today Office','contracts_manager',false),
 ('ad320000-0000-4000-8000-000000000001','ad310000-0000-4000-8000-000000000003','Today Finance','contracts_manager',true),
 ('ad320000-0000-4000-8000-000000000001','ad310000-0000-4000-8000-000000000004','Today Supervisor','supervisor',false),
 ('ad320000-0000-4000-8000-000000000001','ad310000-0000-4000-8000-000000000005','Today Inactive','contracts_manager',true),
 ('ad320000-0000-4000-8000-000000000002','ad310000-0000-4000-8000-000000000006','Other Today Owner','owner',false);
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 ('ad330000-0000-4000-8000-000000000001','ad320000-0000-4000-8000-000000000001','TODAY-CURRENT','Currently assigned job','ad310000-0000-4000-8000-000000000001'),
 ('ad330000-0000-4000-8000-000000000002','ad320000-0000-4000-8000-000000000001','TODAY-BOUNDARY','Assignment ends today','ad310000-0000-4000-8000-000000000001'),
 ('ad330000-0000-4000-8000-000000000003','ad320000-0000-4000-8000-000000000001','TODAY-EXPIRED','Assignment ended yesterday','ad310000-0000-4000-8000-000000000001'),
 ('ad330000-0000-4000-8000-000000000004','ad320000-0000-4000-8000-000000000001','TODAY-FUTURE','Assignment starts tomorrow','ad310000-0000-4000-8000-000000000001'),
 ('ad330000-0000-4000-8000-000000000005','ad320000-0000-4000-8000-000000000002','TODAY-FOREIGN','Other contractor job','ad310000-0000-4000-8000-000000000006');
insert into public.contract_commercials(organisation_id,contract_id,contract_value)
 select organisation_id,id,812345.67 from public.contracts where reference like 'TODAY-%';
insert into public.contract_assignments(organisation_id,contract_id,user_id,valid_from,valid_until) values
 ('ad320000-0000-4000-8000-000000000001','ad330000-0000-4000-8000-000000000001','ad310000-0000-4000-8000-000000000002',current_date,null),
 ('ad320000-0000-4000-8000-000000000001','ad330000-0000-4000-8000-000000000002','ad310000-0000-4000-8000-000000000002',current_date-7,current_date),
 ('ad320000-0000-4000-8000-000000000001','ad330000-0000-4000-8000-000000000003','ad310000-0000-4000-8000-000000000002',current_date-7,current_date-1),
 ('ad320000-0000-4000-8000-000000000001','ad330000-0000-4000-8000-000000000004','ad310000-0000-4000-8000-000000000002',current_date+1,null),
 ('ad320000-0000-4000-8000-000000000001','ad330000-0000-4000-8000-000000000001','ad310000-0000-4000-8000-000000000003',current_date,null),
 ('ad320000-0000-4000-8000-000000000001','ad330000-0000-4000-8000-000000000001','ad310000-0000-4000-8000-000000000004',current_date,null),
 ('ad320000-0000-4000-8000-000000000001','ad330000-0000-4000-8000-000000000001','ad310000-0000-4000-8000-000000000005',current_date,null);
update public.organisation_members set active=false where user_id='ad310000-0000-4000-8000-000000000005';

-- Populate documents through real reservation guards, then the existing trusted
-- upload-completion RPC and private Storage metadata used by other DB tests.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ad310000-0000-4000-8000-000000000001"}',true);
with docs as materialized (
 select gen_random_uuid() as id,c.organisation_id,c.id as contract_id,classification
 from public.contracts c cross join (values('operational'),('commercial')) kinds(classification)
)
insert into public.document_revisions(id,organisation_id,contract_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes)
 select id,organisation_id,contract_id,'TODAY-'||classification,1,
 case when classification='commercial' then 'Private commercial quote' else 'Operational job drawing' end,
 classification,organisation_id||'/'||contract_id||'/'||classification||'/contract/'||id||'.pdf',repeat('a',64),'application/pdf',8
 from docs;
select public.create_supervisor_office_item(gen_random_uuid(),jsonb_build_object('contract_id',id,'kind','instruction',
 'title','Read the saved job instruction','body','Use the authorised drawing for this job.','recipient_id',null)) from public.contracts;
select public.record_site_handover(gen_random_uuid(),jsonb_build_object('contract_id',id,
 'finished_at',to_jsonb(now())#>>'{}','finish_workforce',false,'work_completed','Saved work for the office to read.')) from public.contracts;
select test.assert((select count(*)=4 from public.contracts),
 'Today owner sees every own-organisation job, including unassigned jobs, without crossing organisations');
select test.assert((select count(*)=8 and count(*) filter(where classification='commercial')=4 from public.document_revisions),
 'owner retains existing operational and commercial document authority even without a separate manager finance grant');
select test.assert((select count(*)=4 from public.contract_commercials),
 'owner financial authority stays confined to own organisation');
select test.assert((select count(*)=4 from public.supervisor_office_items) and (select count(*)=4 from public.site_handovers),
 'owner can read saved messages and handovers across own jobs without impersonating their authors');
select test.assert((select count(*)=4 from public.document_revisions where classification='operational'),
 'Today operational-only document projection excludes all private quote titles even for owner');

select set_config('request.jwt.claims','{"sub":"ad310000-0000-4000-8000-000000000006"}',true);
with docs as materialized (
 select gen_random_uuid() as id,c.organisation_id,c.id as contract_id,classification
 from public.contracts c cross join (values('operational'),('commercial')) kinds(classification)
)
insert into public.document_revisions(id,organisation_id,contract_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes)
 select id,organisation_id,contract_id,'TODAY-'||classification,1,'Other contractor private document',
 classification,organisation_id||'/'||contract_id||'/'||classification||'/contract/'||id||'.pdf',repeat('a',64),'application/pdf',8
 from docs;
select public.create_supervisor_office_item(gen_random_uuid(),jsonb_build_object('contract_id',id,'kind','instruction',
 'title','Other contractor instruction','body','Never visible to the first company.','recipient_id',null)) from public.contracts;
select public.record_site_handover(gen_random_uuid(),jsonb_build_object('contract_id',id,
 'finished_at',to_jsonb(now())#>>'{}','finish_workforce',false,'work_completed','Other contractor handover.')) from public.contracts;
reset role;
insert into storage.objects(bucket_id,name,owner,metadata)
 select 'tilespec-evidence',object_path,created_by,jsonb_build_object('size',bytes,'mimetype',mime_type)
 from public.document_revisions where organisation_id in ('ad320000-0000-4000-8000-000000000001','ad320000-0000-4000-8000-000000000002');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.complete_document_upload(id,created_by,sha256) from public.document_revisions
 where organisation_id in ('ad320000-0000-4000-8000-000000000001','ad320000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ad310000-0000-4000-8000-000000000002"}',true);
select test.assert((select count(*)=2 and bool_and(reference in ('TODAY-CURRENT','TODAY-BOUNDARY')) from public.contracts),
 'office current assignment uses inclusive final day and excludes both expired and future jobs');
select test.assert((select count(*)=2 and bool_and(classification='operational' and uploaded_at is not null) from public.document_revisions),
 'non-financial office can read completed operational files on both currently assigned jobs only');
select test.assert((select count(*)=0 from public.contract_commercials),
 'non-financial office receives no commercial rows even when assigned');
select test.assert((select count(*)=2 from public.supervisor_office_items) and (select count(*)=2 from public.site_handovers),
 'office inbox and handovers obey the same current job-assignment boundary');
select test.assert((select count(*)=0 from public.audit_events where commercial),
 'private commercial audit details are also hidden from non-financial office');
select test.assert((select count(*)=0 from public.document_revisions where contract_id='ad330000-0000-4000-8000-000000000005'),
 'guessing the other organisation job ID cannot reveal even operational document metadata');
select test.expect_error($q$select public.save_contract_commercial('ad330000-0000-4000-8000-000000000001',1,'{"contract_value":1}')$q$,array['42501'],
 'daily office access does not grant a financial write or budget approval');

select set_config('request.jwt.claims','{"sub":"ad310000-0000-4000-8000-000000000003"}',true);
select test.assert((select count(*)=1 from public.contract_commercials) and (select count(*)=2 from public.document_revisions),
 'finance-granted office retains commercial authority only for its single assigned job');
select test.assert((select count(*)=0 from public.contract_commercials where contract_id='ad330000-0000-4000-8000-000000000002'),
 'finance grant does not confer an assignment to another own-organisation job');

select set_config('request.jwt.claims','{"sub":"ad310000-0000-4000-8000-000000000004","role":"owner","financial_access":true}',true);
select test.assert((select count(*)=1 and bool_and(classification='operational') from public.document_revisions)
 and (select count(*)=0 from public.contract_commercials),
 'supervisor cannot promote their JWT into financial authority');
select test.assert((select count(*)=1 from public.supervisor_office_items) and (select count(*)=1 from public.site_handovers),
 'supervisor retains only their assigned site messages and handovers');

select set_config('request.jwt.claims','{"sub":"ad310000-0000-4000-8000-000000000005"}',true);
select test.assert((select count(*)=0 from public.contracts) and (select count(*)=0 from public.document_revisions)
 and (select count(*)=0 from public.site_handovers) and (select count(*)=0 from public.contract_commercials),
 'an inactive office member loses all saved job, paperwork, handover and money visibility despite retained assignment');
select set_config('request.jwt.claims','{"sub":"ad310000-0000-4000-8000-000000000006"}',true);
select test.assert((select count(*)=1 and bool_and(reference='TODAY-FOREIGN') from public.contracts)
 and (select count(*)=1 from public.supervisor_office_items) and (select count(*)=1 from public.site_handovers),
 'other organisation owner remains inside their own job, inbox and handover boundary');

-- Existing immutable audit/history remains present after a manager's assignment
-- is withdrawn; only their current read authority changes.
reset role;
delete from public.contract_assignments where user_id='ad310000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ad310000-0000-4000-8000-000000000002"}',true);
select test.assert((select count(*)=0 from public.contracts) and (select count(*)=0 from public.document_revisions)
 and (select count(*)=0 from public.supervisor_office_items) and (select count(*)=0 from public.site_handovers),
 'withdrawing office assignments immediately removes all daily record visibility');
select set_config('request.jwt.claims','{"sub":"ad310000-0000-4000-8000-000000000001"}',true);
select test.assert((select count(*)=4 from public.site_handovers) and (select count(*)=4 from public.supervisor_office_items)
 and exists(select 1 from public.audit_events where entity_type='supervisor_office_items'),
 'withdrawing an office assignment preserves saved handovers, instructions and their audit events');
rollback;
