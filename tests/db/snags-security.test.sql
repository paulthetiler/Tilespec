-- Exercise exact party scope, byte reservations and permanent audit boundaries
-- with the real migrations/RLS. No Supabase or production endpoint is used.
begin;
insert into auth.users(id,email) values
 ('ac100000-0000-4000-8000-000000000001','snag-security-owner@example.invalid'),
 ('ac100000-0000-4000-8000-000000000002','snag-security-supervisor@example.invalid'),
 ('ac100000-0000-4000-8000-000000000003','snag-security-peer@example.invalid'),
 ('ac100000-0000-4000-8000-000000000004','snag-security-original@example.invalid'),
 ('ac100000-0000-4000-8000-000000000005','snag-security-repair@example.invalid');
insert into public.organisations(id,name) values('ac200000-0000-4000-8000-000000000001','Snag security contractor');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access) values
 ('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000001','Security office','owner',true),
 ('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000002','Security supervisor','supervisor',false),
 ('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000003','Peer supervisor','supervisor',false),
 ('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000004','Original installer','subcontract_installer',false),
 ('ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000005','Repair installer','subcontract_installer',false);
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 ('ac300000-0000-4000-8000-000000000001','ac200000-0000-4000-8000-000000000001','SNAG-SEC','Security test site','ac100000-0000-4000-8000-000000000001');
insert into public.contract_assignments(contract_id,organisation_id,user_id) values
 ('ac300000-0000-4000-8000-000000000001','ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000002'),
 ('ac300000-0000-4000-8000-000000000001','ac200000-0000-4000-8000-000000000001','ac100000-0000-4000-8000-000000000003');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001"}',true);
select public.create_locations('ac300000-0000-4000-8000-000000000001',gen_random_uuid(),null,'[{"name":"Security Flat","children":[{"name":"Security Bathroom"}]},{"name":"Different Flat"}]');
select id as flat from public.work_areas where name='Security Flat' \gset
select id as bathroom from public.work_areas where name='Security Bathroom' \gset
select id as different_flat from public.work_areas where name='Different Flat' \gset
select public.create_work_package(:'flat',gen_random_uuid(),'{"name":"Scoped tiling","quantity":1,"unit":"m2"}') as package \gset
select public.create_work_package(:'different_flat',gen_random_uuid(),'{"name":"Other area tiling","quantity":1,"unit":"m2"}') as other_package \gset
insert into public.package_assignments(organisation_id,contract_id,work_package_id,user_id) values
 ('ac200000-0000-4000-8000-000000000001','ac300000-0000-4000-8000-000000000001',:'package','ac100000-0000-4000-8000-000000000004'),
 ('ac200000-0000-4000-8000-000000000001','ac300000-0000-4000-8000-000000000001',:'other_package','ac100000-0000-4000-8000-000000000005');
select public.create_team(gen_random_uuid(),'{"name":"Security original gang","kind":"direct_team"}') as gang \gset
select public.create_operative(gen_random_uuid(),'{"display_name":"Original crew member","engagement":"direct_employee","user_id":"ac100000-0000-4000-8000-000000000004"}') as original_person \gset
select public.create_operative(gen_random_uuid(),'{"display_name":"Separate repair operative","engagement":"direct_employee","user_id":"ac100000-0000-4000-8000-000000000005"}') as repair_person \gset
select public.add_team_member(gen_random_uuid(),jsonb_build_object('team_id',:'gang','operative_id',:'original_person','valid_from',(private.site_today()-1)::text));
select public.record_actual_allocation(gen_random_uuid(),jsonb_build_object('contract_id','ac300000-0000-4000-8000-000000000001','work_area_id',:'bathroom',
 'work_package_id',:'package','team_id',:'gang','stage','installation','operative_ids',jsonb_build_array(:'original_person'),
 'started_at',now()-interval '1 hour','reason','Original team installed the area')) as allocation \gset
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000002"}',true);
select jsonb_build_object('contract_id','ac300000-0000-4000-8000-000000000001','work_area_id',:'bathroom','work_package_id',:'package','stage','installation',
 'category','Poor alignment','severity','major','description','Original alignment finding','required_rectification','Realign tiles') as data \gset
select gen_random_uuid() as create_key \gset
select public.create_snag(:'create_key',:'data') as snag \gset
select test.expect_error(format('select public.create_snag(%L,%L)',:'create_key',(:'data'::jsonb||'{"description":"Changed request"}')::text),array['22023'],
 'a reused creation request key cannot change the original findings');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000003"}',true);
select test.assert((select count(*)=0 from public.supervisor_issues where id=:'snag'),'another assigned supervisor cannot read a private incomplete draft');
select test.expect_error(format('select public.snag_context(%L)',:'snag'),array['42501'],'private draft context rejects another supervisor');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000002"}',true);
select test.expect_error(format('select public.reserve_snag_photo(%L,gen_random_uuid(),''original'',''{"mime_type":"image/svg+xml","sha256":"%s","bytes":8}'')',:'snag',repeat('a',64)),array['22023'],'image reservations reject active content types');
select test.expect_error(format('select public.reserve_snag_photo(%L,gen_random_uuid(),''original'',''{"mime_type":"image/png","sha256":"%s","bytes":4194305}'')',:'snag',repeat('a',64)),array['22023'],'image reservations reject more than 4 MB');
select test.expect_error(format('select public.reserve_snag_photo(%L,gen_random_uuid(),''original'',''{"mime_type":"image/png","sha256":"bad","bytes":8}'')',:'snag'),array['22023'],'image reservations require a SHA-256 digest');
select gen_random_uuid() as photo_key \gset
select public.reserve_snag_photo(:'snag',:'photo_key','original',jsonb_build_object('mime_type','image/png','sha256',repeat('a',64),'bytes',8)) as photo \gset
select test.expect_error(format('select public.reserve_snag_photo(%L,%L,''original'',''{"mime_type":"image/png","sha256":"%s","bytes":9}'')',:'snag',:'photo_key',repeat('a',64)),array['22023'],'a reused image request key cannot change the expected stored bytes');
select object_path as path from public.supervisor_issue_photos where id=:'photo' \gset
select test.expect_error(format('insert into storage.objects(bucket_id,name,owner,metadata) values(''supervisor-evidence'',%L,auth.uid(),''{}'')',replace(:'path',:'photo','00000000-0000-4000-8000-000000000001')),array['42501'],
 'evidence storage rejects objects without a caller-owned reservation');
insert into storage.objects(bucket_id,name,owner,metadata) values('supervisor-evidence',:'path',auth.uid(),'{"size":9,"mimetype":"image/png"}');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select test.expect_error(format('select public.complete_snag_photo(%L,%L,repeat(''a'',64))',:'photo','ac100000-0000-4000-8000-000000000002'),array['23514'],'trusted completion rejects stored metadata that differs from reserved bytes');
select test.expect_error(format('select public.complete_snag_photo(%L,%L,repeat(''a'',64))',:'photo','ac100000-0000-4000-8000-000000000003'),array['42501'],'trusted completion rejects a different uploader');
select test.expect_error(format('select public.complete_snag_photo(%L,%L,repeat(''b'',64))',:'photo','ac100000-0000-4000-8000-000000000002'),array['42501'],'trusted completion rejects a different content digest');
select test.assert((select uploaded_at is null and event_id is null from public.supervisor_issue_photos where id=:'photo'),'all failed verification attempts leave evidence unverified and unattached');
update storage.objects set metadata='{"size":8,"mimetype":"image/png"}' where name=:'path';
select public.complete_snag_photo(:'photo','ac100000-0000-4000-8000-000000000002',repeat('a',64));
select uploaded_at::text as verified_at from public.supervisor_issue_photos where id=:'photo' \gset
select public.complete_snag_photo(:'photo','ac100000-0000-4000-8000-000000000002',repeat('a',64));
select test.assert((select uploaded_at::text=:'verified_at' from public.supervisor_issue_photos where id=:'photo'),'trusted upload verification retries preserve the original verification timestamp');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000002"}',true);
select public.transition_snag(:'snag',gen_random_uuid(),1,'submit',jsonb_build_object('note','Original photographs verified and submitted','photo_ids',jsonb_build_array(:'photo')));
select public.transition_snag(:'snag',gen_random_uuid(),2,'propose_responsibility',jsonb_build_object('note','Historical presence is proposed evidence only','allocation_id',:'allocation'));
select public.transition_snag(:'snag',gen_random_uuid(),3,'assign',jsonb_build_object('note','Repair by an independent operative','operative_id',:'repair_person','required_action','Realign the tiles','target_date',private.site_today()::text));
select public.transition_snag(:'snag',gen_random_uuid(),4,'propose_responsibility',jsonb_build_object('note','Refined proposal after reviewing findings','allocation_id',:'allocation'));
select test.assert((select responsibility_state='proposed' and version=5 from public.supervisor_issues where id=:'snag'),
 'supervisors may revise a responsibility proposal before office confirmation');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001"}',true);
select public.transition_snag(:'snag',gen_random_uuid(),5,'review_responsibility','{"note":"Office confirmed the explicit proposal after review","decision":"confirmed"}');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000002"}',true);
select test.expect_error(format('select public.transition_snag(%L,gen_random_uuid(),6,''propose_responsibility'',jsonb_build_object(''note'',''Try overriding a confirmed office decision'',''allocation_id'',%L))',:'snag',:'allocation'),array['42501'],
 'a supervisor cannot silently replace an office-confirmed responsibility decision');
select test.expect_error(format('select public.transition_snag(%L,gen_random_uuid(),6,''mark_unknown'',''{"note":"Try erasing a confirmed office decision"}'')',:'snag'),array['42501'],
 'a supervisor cannot clear an office-confirmed responsibility decision');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001"}',true);
select public.transition_snag(:'snag',gen_random_uuid(),6,'propose_responsibility',jsonb_build_object('note','Office reopened responsibility review with an explicit proposal','allocation_id',:'allocation'));
select test.assert(exists(select 1 from jsonb_array_elements(public.snag_events(:'snag')) e where e->>'action'='review_responsibility' and e->'snapshot'->>'responsibility_state'='confirmed'),
 'office revision preserves the previous confirmed decision permanently');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000004"}',true);
select test.assert(private.can_read_snag(:'snag') and not private.is_snag_party(:'snag',true),'a proposed original gang may see its finding without being authorised as the repair party');
select test.expect_error(format('select public.reserve_snag_photo(%L,gen_random_uuid(),''rectification'',''{"mime_type":"image/png","sha256":"%s","bytes":8}'')',:'snag',repeat('c',64)),array['42501'],'original responsibility does not authorise another party to submit the repair');
select test.assert(not exists(select 1 from jsonb_array_elements(public.snag_context(:'snag')->'events') e where e->'snapshot' ? 'attendance' or e->'snapshot' ? 'work_presence'),
 'installer context never contains protected workforce attendance or allocation snapshots');
select test.assert((select count(*)=1 from storage.objects where name=:'path'),'an explicitly scoped party can review the saved original evidence privately');
select test.assert((select count(*)=0 from public.actual_allocation_operatives) and (select count(*)=0 from public.location_inspections),
 'snag party access does not grant inspection or historical operative directory access');
select test.expect_error(format('update public.supervisor_issue_photos set object_path=''replacement.png'' where id=%L',:'photo'),array['42501'],'an installer cannot replace original evidence records');
select test.assert(not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'supervisor%' and cmd in ('UPDATE','DELETE','ALL')),
 'private snag objects have no client replacement or deletion policy');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000005"}',true);
select test.assert(not private.can_read_snag(:'snag'),'repair assignment alone does not grant access outside the installer package location');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001"}',true);
insert into public.package_assignments(organisation_id,contract_id,work_package_id,user_id)
 values('ac200000-0000-4000-8000-000000000001','ac300000-0000-4000-8000-000000000001',:'package','ac100000-0000-4000-8000-000000000005');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000005"}',true);
select test.assert(private.is_snag_party(:'snag',true),'an active assigned operative with package/location scope may submit repair evidence');
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001"}',true);
delete from public.package_assignments where work_package_id=:'package' and user_id='ac100000-0000-4000-8000-000000000005';
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000005"}',true);
select test.assert(not private.can_read_snag(:'snag') and (select count(*)=0 from storage.objects where name=:'path'),
 'revoking package access immediately revokes the assigned snag and original private bytes');
reset role;
update public.teams set active=false where id=:'gang';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000004"}',true);
select test.assert(not private.can_read_snag(:'snag'),'an inactive proposed gang no longer grants installer snag access');
reset role;
update public.teams set active=true where id=:'gang';
-- Mixed authority must stay separate: an individually assigned repair
-- operative keeps that permission even when their former proposed gang is
-- inactive, but cannot use repair access to respond on the gang's behalf.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000001"}',true);
select public.transition_snag(:'snag',gen_random_uuid(),7,'assign',jsonb_build_object('note','Assign repair individually without granting gang decision authority',
 'operative_id',:'original_person','required_action','Realign the affected tiles as an individual repair assignment','target_date',private.site_today()::text));
reset role;
update public.teams set active=false where id=:'gang';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000004"}',true);
select test.assert(private.can_read_snag(:'snag') and private.is_snag_party(:'snag',true),
 'individual repair access survives deactivation of a separately proposed gang');
select test.assert((public.snag_context(:'snag')->'permissions'->>'repair')::boolean
 and not (public.snag_context(:'snag')->'permissions'->>'proposed_party')::boolean,
 'mixed repair and inactive-gang context grants repair permission without proposed-party response permission');
select test.expect_error(format('select public.transition_snag(%L,gen_random_uuid(),8,''accept_responsibility'',''{"note":"Try accepting for an inactive former gang through individual repair access"}'')',:'snag'),array['42501'],
 'an individually assigned repair operative cannot accept responsibility for an inactive proposed gang');
select test.expect_error(format('select public.transition_snag(%L,gen_random_uuid(),8,''dispute_responsibility'',''{"note":"Try disputing for an inactive former gang through individual repair access"}'')',:'snag'),array['42501'],
 'an individually assigned repair operative cannot dispute responsibility for an inactive proposed gang');
select test.assert((select responsibility_state='proposed' and version=8 from public.supervisor_issues where id=:'snag')
 and not exists(select 1 from jsonb_array_elements(public.snag_events(:'snag')) e where e->>'action' in ('accept_responsibility','dispute_responsibility')),
 'refused inactive-gang responses change neither responsibility, version nor permanent history');
reset role;
update public.teams set active=true where id=:'gang';
update public.organisation_members set active=false where user_id='ac100000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000004"}',true);
select test.assert(not private.can_read_snag(:'snag') and (public.snag_register('{}',0)->>'total')::integer=0,
 'deactivating a proposed party membership immediately removes snag records and counts');
reset role;
update public.contract_assignments set valid_from=current_date-10,valid_until=current_date-1 where user_id='ac100000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ac100000-0000-4000-8000-000000000002"}',true);
select test.assert(not private.can_read_snag(:'snag') and (select count(*)=0 from storage.objects where name=:'path'),
 'an expired supervisor site assignment loses its snag and private evidence access');
select test.expect_error(format('select public.snag_context(%L)',:'snag'),array['42501'],'expired site assignment cannot use a definer context RPC');
reset role;
select test.expect_error(format('update public.supervisor_issue_photos set uploaded_at=now()+interval ''1 day'' where id=%L',:'photo'),array['42501'],'even privileged SQL cannot rewrite the evidence verification time');
select test.expect_error(format('update public.supervisor_issue_photos set event_id=null where id=%L',:'photo'),array['42501'],'even privileged SQL cannot detach photographs from permanent lifecycle events');
select test.assert(not has_function_privilege('anon','public.create_snag(uuid,jsonb)','EXECUTE')
 and not has_function_privilege('anon','public.snag_context(uuid)','EXECUTE')
 and not has_function_privilege('authenticated','public.complete_snag_photo(uuid,uuid,text)','EXECUTE'),
 'anonymous snag RPCs and authenticated byte-certification RPCs have no EXECUTE grant');
rollback;
