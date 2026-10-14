-- Phase 2B: the supervisor confirms the office's plan for the day and records
-- what actually happened. Scenario letters follow the Phase 2B brief.
-- Disposable local database only; permission assertions run as non-superusers.
begin;

insert into auth.users(id, email) values
  ('b6100000-0000-4000-8000-000000000001', 'dw-owner@example.invalid'),
  ('b6100000-0000-4000-8000-000000000002', 'dw-manager@example.invalid'),
  ('b6100000-0000-4000-8000-000000000003', 'dw-supervisor@example.invalid'),
  ('b6100000-0000-4000-8000-000000000004', 'dw-unassigned-supervisor@example.invalid'),
  ('b6100000-0000-4000-8000-000000000005', 'dw-installer@example.invalid'),
  ('b6100000-0000-4000-8000-000000000006', 'dw-other-supervisor@example.invalid'),
  ('b6100000-0000-4000-8000-000000000007', 'dw-other-owner@example.invalid');
insert into public.organisations(id, name) values
  ('b6200000-0000-4000-8000-000000000001', 'Daily workforce contractor'), ('b6200000-0000-4000-8000-000000000002', 'Another contractor');
insert into public.organisation_members(organisation_id, user_id, display_name, role, financial_access) values
  ('b6200000-0000-4000-8000-000000000001', 'b6100000-0000-4000-8000-000000000001', 'Olive Owner', 'owner', true),
  ('b6200000-0000-4000-8000-000000000001', 'b6100000-0000-4000-8000-000000000002', 'Mia Manager', 'contracts_manager', false),
  ('b6200000-0000-4000-8000-000000000001', 'b6100000-0000-4000-8000-000000000003', 'Sid Supervisor', 'supervisor', false),
  ('b6200000-0000-4000-8000-000000000001', 'b6100000-0000-4000-8000-000000000004', 'Una Unassigned', 'supervisor', false),
  ('b6200000-0000-4000-8000-000000000001', 'b6100000-0000-4000-8000-000000000005', 'Ian Installer', 'subcontract_installer', false),
  ('b6200000-0000-4000-8000-000000000002', 'b6100000-0000-4000-8000-000000000006', 'Oscar Other', 'supervisor', false),
  ('b6200000-0000-4000-8000-000000000002', 'b6100000-0000-4000-8000-000000000007', 'Ola Other', 'owner', true);
insert into public.contracts(id, organisation_id, reference, name, created_by) values
  ('b6300000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000001', 'APT-B', 'Riverside apartments Block B', 'b6100000-0000-4000-8000-000000000001'),
  ('b6300000-0000-4000-8000-000000000002', 'b6200000-0000-4000-8000-000000000002', 'OTHER-1', 'Another contractor site', 'b6100000-0000-4000-8000-000000000007');
insert into public.contract_assignments(contract_id, organisation_id, user_id) values
  ('b6300000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000001', 'b6100000-0000-4000-8000-000000000002'),
  ('b6300000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000001', 'b6100000-0000-4000-8000-000000000003'),
  ('b6300000-0000-4000-8000-000000000002', 'b6200000-0000-4000-8000-000000000002', 'b6100000-0000-4000-8000-000000000006');

-- These fixtures use real RLS/RPCs. Only stored-byte completion is stood in by
-- trusted SQL here; the application E2E test additionally verifies actual bytes.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b6100000-0000-4000-8000-000000000002"}',true);
select public.create_locations('b6300000-0000-4000-8000-000000000001',gen_random_uuid(),null,'[{"name":"Flat 52","children":[{"name":"Bathroom"}]},{"name":"Flat 53"}]');
select id as flat from public.work_areas where name='Flat 52' \gset
select id as bath from public.work_areas where name='Bathroom' \gset
select id as other_location from public.work_areas where name='Flat 53' \gset
select public.create_work_package(:'flat',gen_random_uuid(),'{"name":"Bathroom tiling","quantity":10,"unit":"m2"}') as package \gset
insert into public.package_assignments(organisation_id,contract_id,work_package_id,user_id)
 values('b6200000-0000-4000-8000-000000000001','b6300000-0000-4000-8000-000000000001',:'package','b6100000-0000-4000-8000-000000000005');
select public.create_team(gen_random_uuid(),'{"name":"Original gang","kind":"direct_team"}') as gang \gset
select public.create_team(gen_random_uuid(),'{"name":"Repair gang","kind":"direct_team"}') as repair_gang \gset
select public.create_operative(gen_random_uuid(),'{"display_name":"Installer","engagement":"direct_employee","user_id":"b6100000-0000-4000-8000-000000000005"}') as operative \gset
select public.add_team_member(gen_random_uuid(),jsonb_build_object('team_id',:'gang','operative_id',:'operative','valid_from',(private.site_today()-1)::text));
select public.record_actual_allocation(gen_random_uuid(),jsonb_build_object('contract_id','b6300000-0000-4000-8000-000000000001',
 'work_area_id',:'flat','work_package_id',:'package','team_id',:'gang','stage','installation','operative_ids',jsonb_build_array(:'operative'),
 'started_at',now()-interval '2 hours','reason','Unplanned installation')) as allocation \gset
select public.create_location_inspection_template(gen_random_uuid(),jsonb_build_object('contract_id','b6300000-0000-4000-8000-000000000001','work_area_id',:'bath',
 'stage','installation','title','Tile finish','specification_reference','SPEC-1','specification_revision','B','wet_area',true,
 'checklist','[{"label":"Surface level","wet_only":false}]'::jsonb)) as template \gset
select set_config('request.jwt.claims','{"sub":"b6100000-0000-4000-8000-000000000003"}',true);
select public.record_location_inspection(gen_random_uuid(),jsonb_build_object('contract_id','b6300000-0000-4000-8000-000000000001','work_area_id',:'bath',
 'template_id',:'template','answers','[{"status":"issue","note":"Three tiles have excessive lippage"}]'::jsonb,'allocation_ids',jsonb_build_array(:'allocation'))) as inspection \gset
select md5(to_jsonb(i)::text) as inspection_before from public.location_inspections i \gset
select gen_random_uuid() as create_key \gset
select jsonb_build_object('contract_id','b6300000-0000-4000-8000-000000000001','work_area_id',:'bath','work_package_id',:'package','inspection_id',:'inspection',
 'stage','installation','category','Excessive lippage','severity','major','description','Three tiles beside the doorway have excessive lippage',
 'required_rectification','Lift and relay tiles to the specification') as snag_data \gset
select public.create_snag(:'create_key',:'snag_data') as snag \gset
select test.assert(public.create_snag(:'create_key',:'snag_data')=:'snag','B/L: creation retry returns one linked snag');
select test.assert((select snag_status='draft' and responsibility_state='not_assessed' and responsibility_team_id is null from public.supervisor_issues where id=:'snag'),'A/K: draft is not submitted, with no automatic liability or guessed crew');
select test.assert((select md5(to_jsonb(i)::text)=:'inspection_before' from public.location_inspections i),'B: original failed inspection is unchanged');
select test.assert((public.snag_register('{}',0)->'counts'->>'open')::integer=0,'K: incomplete drafts do not appear in open snag counts');
select test.expect_error(format('select public.transition_snag(%L,gen_random_uuid(),1,''submit'',''{"note":"Submit initial snag","photo_ids":[]}'')',:'snag'),array['22023'],'K: cannot submit a snag without verified original evidence');
select public.reserve_snag_photo(:'snag',gen_random_uuid(),'original',jsonb_build_object('mime_type','image/png','sha256',repeat('a',64),'bytes',8)) as original \gset
select test.expect_error(format('select public.complete_snag_photo(%L,auth.uid(),repeat(''a'',64))',:'original'),array['42501'],'J/K: clients cannot certify their own upload');
select test.expect_error(format('select public.transition_snag(%L,gen_random_uuid(),1,''submit'',jsonb_build_object(''note'',''Original snag submission'',''photo_ids'',jsonb_build_array(%L)))',:'snag',:'original'),array['22023'],'K: a reservation alone is not photographic evidence');
reset role;
create function pg_temp.store_and_verify(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.supervisor_issue_photos; original_claims text:=current_setting('request.jwt.claims',true);
begin
 select * into p from public.supervisor_issue_photos where id=p_id;
 insert into storage.objects(bucket_id,name,owner,metadata) values('supervisor-evidence',p.object_path,p.actor_id,jsonb_build_object('size',p.bytes,'mimetype',p.mime_type));
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform public.complete_snag_photo(p.id,p.actor_id,p.sha256);
 perform set_config('request.jwt.claims',original_claims,true);
end $$;
set local role authenticated;
select pg_temp.store_and_verify(:'original');
select gen_random_uuid() as submit_key \gset
select jsonb_build_object('note','Three tiles need relaying','photo_ids',jsonb_build_array(:'original')) as submit_data \gset
select public.transition_snag(:'snag',:'submit_key',1,'submit',:'submit_data');
select test.assert(public.transition_snag(:'snag',:'submit_key',1,'submit',:'submit_data')=:'snag','L: lost-response retry is accepted even after version advanced');
select test.assert((select count(*)=1 from public.supervisor_issue_events where issue_id=:'snag' and action='submit'),'L: retry creates no duplicate lifecycle event');
select test.assert((select snag_status='open' and state='open' and version=2 from public.supervisor_issues where id=:'snag'),'A: photographic snag is genuinely submitted');
select test.expect_error(format('select public.transition_snag(%L,gen_random_uuid(),1,''mark_unknown'',''{"note":"Not enough information"}'')',:'snag'),array['40001'],'L: stale versions cannot overwrite a newer decision');
select test.expect_error(format('select public.transition_supervisor_issue(%L,''report_rectification'',''Try bypassing the snag workflow'')',:'snag'),array['22023'],'J: legacy transition cannot bypass the new workflow');
select public.transition_snag(:'snag',gen_random_uuid(),2,'propose_responsibility',jsonb_build_object('note','Historical presence is evidence, not proof of fault','allocation_id',:'allocation'));
select test.assert((select responsibility_state='proposed' and responsibility_allocation_id=:'allocation' from public.supervisor_issues where id=:'snag'),'C: responsibility is explicit and linked to an actual work period');
select set_config('request.jwt.claims','{"sub":"b6100000-0000-4000-8000-000000000005"}',true);
select test.assert((select count(*)=1 from public.supervisor_issues),'J: proposed party sees only their explicitly authorised snag');
select test.assert((select count(*)=0 from public.actual_allocations),'J: installer still cannot read workforce allocations');
select test.expect_error('select snapshot from public.supervisor_issue_events',array['42501'],'J: direct JSON column access cannot leak workforce snapshots');
select test.assert(not exists(select 1 from jsonb_array_elements(public.snag_events(:'snag')) e where e->'snapshot' ? 'attendance' or e->'snapshot' ? 'work_presence'),'J: installer event projection removes protected workforce data');
select public.transition_snag(:'snag',gen_random_uuid(),3,'dispute_responsibility','{"note":"Tiles were altered after our gang left"}');
select test.assert((select responsibility_state='disputed' and escalated from public.supervisor_issues),'D: dispute is recorded and escalated');
select test.expect_error(format('select public.transition_snag(%L,gen_random_uuid(),4,''review_responsibility'',''{"note":"Try changing the decision","decision":"confirmed"}'')',:'snag'),array['42501'],'D/J: installer cannot decide responsibility');
select set_config('request.jwt.claims','{"sub":"b6100000-0000-4000-8000-000000000002"}',true);
select public.transition_snag(:'snag',gen_random_uuid(),4,'review_responsibility','{"note":"Office reviewing records and photographs","decision":"under_review"}');
select public.transition_snag(:'snag',gen_random_uuid(),5,'review_responsibility','{"note":"Reviewed physical findings and agreed responsibility","decision":"confirmed"}');
select public.transition_snag(:'snag',gen_random_uuid(),6,'resolve_escalation','{"note":"Office review completed; proceed with independent QA"}');
select public.transition_snag(:'snag',gen_random_uuid(),7,'assign',jsonb_build_object('note','Different repair operative assignment; responsibility unchanged',
 'operative_id',:'operative','required_action','Relay the three doorway tiles','target_date',(private.site_today()-1)::text));
select test.assert((select snag_status='assigned' and assigned_operative_id=:'operative' and responsibility_team_id=:'gang' from public.supervisor_issues),'E: repair assignment is separate from original responsibility');
select test.assert((public.snag_register('{"overdue":true}',0)->>'total')::integer=1,'register filters include overdue assigned repairs');
select test.assert((select count(*)=1 from public.team_memberships where operative_id=:'operative' and team_id=:'gang'),'E: snag assignment never changes permanent membership');
select set_config('request.jwt.claims','{"sub":"b6100000-0000-4000-8000-000000000005"}',true);
select public.reserve_snag_photo(:'snag',gen_random_uuid(),'rectification',jsonb_build_object('mime_type','image/png','sha256',repeat('b',64),'bytes',8)) as repair1 \gset
select pg_temp.store_and_verify(:'repair1');
select public.transition_snag(:'snag',gen_random_uuid(),8,'submit_rectification',jsonb_build_object('note','Tiles relaid, awaiting independent check','completed_on',private.site_today()::text,'photo_ids',jsonb_build_array(:'repair1')));
select test.assert((select snag_status='rectification_submitted' and closed_at is null from public.supervisor_issues),'E: submitting repair evidence never closes the snag');
select test.expect_error(format('select public.transition_snag(%L,gen_random_uuid(),9,''accept'',''{"note":"Try approving my own correction"}'')',:'snag'),array['42501'],'H: submitting installer cannot approve their correction');
select set_config('request.jwt.claims','{"sub":"b6100000-0000-4000-8000-000000000003"}',true);
select public.transition_snag(:'snag',gen_random_uuid(),9,'start_reinspection','{"note":"Physical reinspection of the doorway"}');
select public.reserve_snag_photo(:'snag',gen_random_uuid(),'reinspection',jsonb_build_object('mime_type','image/png','sha256',repeat('c',64),'bytes',8)) as reinspection1 \gset
select pg_temp.store_and_verify(:'reinspection1');
select public.transition_snag(:'snag',gen_random_uuid(),10,'reject',jsonb_build_object('note','Lippage remains outside the specification','photo_ids',jsonb_build_array(:'reinspection1')));
select test.assert((select snag_status='open' and repair_cycle=2 from public.supervisor_issues),'F: failed repair reopens the snag');
select test.assert((select count(*)=1 from public.supervisor_issue_events where action='submit_rectification') and (select count(*)=1 from public.supervisor_issue_events where action='reject'),'F: failed repair and rejection both remain in permanent history');
select test.assert((select count(*)=3 from public.supervisor_issue_photos where uploaded_at is not null and event_id is not null),'F/M: original, failed repair and reinspection evidence all survive');
select test.expect_error(format('select public.transition_snag(%L,gen_random_uuid(),11,''submit_rectification'',jsonb_build_object(''note'',''Reuse an old failed repair photograph'',''completed_on'',private.site_today()::text,''photo_ids'',jsonb_build_array(%L)))',:'snag',:'repair1'),array['22023'],'F: a new repair cycle cannot reuse a photograph from a failed attempt');
-- A supervisor submits the second repair on behalf of the crew. Even this role
-- cannot approve the correction they submitted; a different manager must accept.
select public.reserve_snag_photo(:'snag',gen_random_uuid(),'rectification',jsonb_build_object('mime_type','image/png','sha256',repeat('d',64),'bytes',8)) as repair2 \gset
select pg_temp.store_and_verify(:'repair2');
select public.transition_snag(:'snag',gen_random_uuid(),11,'submit_rectification',jsonb_build_object('note','Second correction completed by the assigned operative','completed_on',private.site_today()::text,'photo_ids',jsonb_build_array(:'repair2')));
select public.transition_snag(:'snag',gen_random_uuid(),12,'start_reinspection','{"note":"Ready for independent manager reinspection"}');
select test.expect_error(format('select public.transition_snag(%L,gen_random_uuid(),13,''accept'',''{"note":"Supervisor approving own submitted repair"}'')',:'snag'),array['42501'],'H: the database prevents self-approval even for a supervisor');
select set_config('request.jwt.claims','{"sub":"b6100000-0000-4000-8000-000000000002"}',true);
select public.transition_snag(:'snag',gen_random_uuid(),13,'accept','{"note":"Physically inspected: all three tiles comply"}');
select test.assert((select snag_status='closed' and closed_by=auth.uid() and closed_by<>rectified_by from public.supervisor_issues),'G: independent authorised acceptance closes the snag');
select test.assert((public.snag_register('{"status":"closed","search":"lippage"}',0)->>'total')::integer=1,'register supports saved status and searchable findings');
select public.transition_snag(:'snag',gen_random_uuid(),14,'reopen','{"note":"Later movement observed; needs another repair cycle"}');
select test.assert((select count(*)=1 from public.supervisor_issue_events where action='accept'),'M: reopening preserves the earlier acceptance');
select public.transition_snag(:'snag',gen_random_uuid(),15,'cancel','{"note":"Duplicate finding recorded in error; keep its history"}');
select test.assert((select snag_status='cancelled' from public.supervisor_issues),'cancelled findings remain with an explanation');
-- I: critical findings escalate without any contract/work-package release edit.
select public.create_snag(gen_random_uuid(),:'snag_data'::jsonb||'{"severity":"critical","inspection_id":null}') as critical \gset
select public.reserve_snag_photo(:'critical',gen_random_uuid(),'original',jsonb_build_object('mime_type','image/png','sha256',repeat('e',64),'bytes',8)) as critical_photo \gset
select pg_temp.store_and_verify(:'critical_photo');
select public.transition_snag(:'critical',gen_random_uuid(),1,'submit',jsonb_build_object('note','Potential serious concern requires immediate office review','photo_ids',jsonb_build_array(:'critical_photo')));
select test.assert((select escalated and snag_status='open' from public.supervisor_issues where id=:'critical'),'I: critical snag escalates immediately on genuine submission');
select test.assert((select state='draft' from public.contracts where id='b6300000-0000-4000-8000-000000000001'),'I: escalation does not invent a QA hold or installation release');
select test.assert((public.snag_register('{}',0)->'counts'->>'critical')::integer=1,'I: critical count comes from saved status');
-- J: cross-organisation, unassigned, expired and direct mutations fail.
select set_config('request.jwt.claims','{"sub":"b6100000-0000-4000-8000-000000000004"}',true);
select test.assert((select count(*)=0 from public.supervisor_issues),'J: unassigned supervisor reads no snags');
select test.expect_error(format('select public.create_snag(gen_random_uuid(),%L)',:'snag_data'),array['42501'],'J: unassigned supervisor cannot create');
select set_config('request.jwt.claims','{"sub":"b6100000-0000-4000-8000-000000000007"}',true);
select test.assert((public.snag_register('{}',0)->>'total')::integer=0,'J: another tenant sees no counts or records');
select test.expect_error(format('select public.snag_events(%L)',:'critical'),array['42501'],'J: another tenant cannot retrieve history');
select test.expect_error(format('select public.reserve_snag_photo(%L,gen_random_uuid(),''original'',jsonb_build_object(''mime_type'',''image/png'',''bytes'',8,''sha256'',repeat(''a'',64)))',:'critical'),array['42501'],'J: another tenant cannot reserve evidence');
select test.expect_error(format('update public.supervisor_issues set snag_status=''closed'' where id=%L',:'critical'),array['42501'],'J: direct status edits are denied');
reset role;
select test.expect_error(format('update public.supervisor_issue_events set note=''Rewrite the past'' where issue_id=%L',:'snag'),array['42501'],'M: privileged SQL cannot rewrite lifecycle history');
select test.expect_error(format('delete from public.supervisor_issue_photos where id=%L',:'original'),array['42501'],'M: original photographs cannot be deleted');
select test.expect_error(format('update public.supervisor_issues set description=''Alter original findings'' where id=%L',:'snag'),array['42501'],'M: original findings cannot be rewritten');
rollback;
