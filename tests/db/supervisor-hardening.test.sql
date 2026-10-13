-- Existing supervisor inspection/issue records: integrity regressions.
-- Disposable local database only; every permission assertion runs as a non-superuser.
begin;

insert into auth.users(id, email) values
  ('e1000000-0000-0000-0000-000000000001', 'hardening-owner@example.invalid'),
  ('e1000000-0000-0000-0000-000000000002', 'hardening-supervisor@example.invalid'),
  ('e1000000-0000-0000-0000-000000000003', 'hardening-manager@example.invalid'),
  ('e1000000-0000-0000-0000-000000000004', 'hardening-installer@example.invalid');
insert into public.organisations(id, name) values ('e2000000-0000-0000-0000-000000000001', 'Hardening fixture company');
insert into public.organisation_members(organisation_id, user_id, display_name, role, financial_access) values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Owner', 'owner', true),
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', 'Site Supervisor', 'supervisor', false),
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000003', 'Contracts Manager', 'contracts_manager', false),
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000004', 'Installer', 'subcontract_installer', false);
insert into public.contracts(id, organisation_id, reference, name, created_by) values
  ('e3000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'HARD-001', 'Retail unit toilets', 'e1000000-0000-0000-0000-000000000001');
insert into public.contract_assignments(contract_id, organisation_id, user_id) values
  ('e3000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002'),
  ('e3000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000003');

create temporary table answers_fixture as select
  (select jsonb_agg(jsonb_build_object('item', 'Check ' || g, 'status', case when g = 2 then 'issue' else 'pass' end,
    'note', case when g = 2 then 'Wet screed in staff toilet' else '' end) order by g) from generate_series(1, 10) g) as good;
grant select on answers_fixture to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000002"}', true);

-- The client tries to backdate and understate; the server records the truth.
insert into public.supervisor_inspections(id, organisation_id, contract_id, actor_id, request_key, answers, issues_count, created_at)
select 'e4000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
  auth.uid(), 'e5000000-0000-0000-0000-000000000001', good, 0, now() - interval '30 days' from answers_fixture;
select test.assert((select created_at > now() - interval '1 minute' from public.supervisor_inspections where id = 'e4000000-0000-0000-0000-000000000001'),
  'inspection time is server time; a client-supplied backdated timestamp is ignored');
select test.assert((select issues_count = 1 from public.supervisor_inspections where id = 'e4000000-0000-0000-0000-000000000001'),
  'issue count is derived from the answers, not trusted from the client');
select test.assert((select count(*) = 1 from public.supervisor_issues where inspection_id = 'e4000000-0000-0000-0000-000000000001'),
  'the recorded issue still creates exactly one register entry');

select test.expect_error($q$insert into public.supervisor_inspections(organisation_id, contract_id, actor_id, request_key, answers, issues_count)
  select 'e2000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', auth.uid(), gen_random_uuid(),
    jsonb_set(good, '{0}', '{"item":"Check 1","status":"na","note":"  "}'), 0 from answers_fixture$q$,
  array['22023'], 'N/A without a reason is rejected at the database');
select test.expect_error($q$insert into public.supervisor_inspections(organisation_id, contract_id, actor_id, request_key, answers, issues_count)
  select 'e2000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', auth.uid(), gen_random_uuid(),
    jsonb_set(good, '{1}', '{"item":"Check 1","status":"pass","note":""}'), 0 from answers_fixture$q$,
  array['22023'], 'the same check cannot be answered twice to pad the inspection');
select test.expect_error($q$insert into public.supervisor_inspections(organisation_id, contract_id, actor_id, request_key, answers, issues_count)
  select 'e2000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000003', gen_random_uuid(), good, 0 from answers_fixture$q$,
  array['42501'], 'a supervisor cannot record an inspection in another person''s name');

-- Evidence must exist in storage before it can be recorded.
select test.expect_error($q$insert into public.supervisor_issue_photos(issue_id, organisation_id, object_path)
  select id, organisation_id, organisation_id || '/' || id || '/never-uploaded.jpg' from public.supervisor_issues
  where inspection_id = 'e4000000-0000-0000-0000-000000000001'$q$,
  array['23514'], 'a photograph record cannot point at an object that was never uploaded');
reset role;

-- Simulate one legacy fabricated record from before this guard existed.
alter table public.supervisor_issue_photos disable trigger guard_issue_photo;
insert into public.supervisor_issue_photos(issue_id, organisation_id, actor_id, object_path)
select id, organisation_id, 'e1000000-0000-0000-0000-000000000002', organisation_id || '/' || id || '/legacy-missing.jpg'
from public.supervisor_issues where inspection_id = 'e4000000-0000-0000-0000-000000000001';
alter table public.supervisor_issue_photos enable trigger guard_issue_photo;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000002"}', true);
select public.transition_supervisor_issue(id, 'report_rectification', 'Screed dried and area cleaned') from public.supervisor_issues where inspection_id = 'e4000000-0000-0000-0000-000000000001';
select public.transition_supervisor_issue(id, 'request_reinspection', 'Ready for independent check') from public.supervisor_issues where inspection_id = 'e4000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000003"}', true);
select test.expect_error($q$select public.transition_supervisor_issue(id, 'close_after_reinspection', 'Looked at photo record')
  from public.supervisor_issues where inspection_id = 'e4000000-0000-0000-0000-000000000001'$q$,
  array['23514'], 'closure cannot rely on a legacy photo record whose object does not exist');
reset role;

-- The Storage API records the uploaded object; the application then records it.
insert into storage.objects(bucket_id, name, metadata)
select 'supervisor-evidence', organisation_id || '/' || id || '/rectified.jpg', '{"size":2048,"mimetype":"image/jpeg"}'
from public.supervisor_issues where inspection_id = 'e4000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000002"}', true);
insert into public.supervisor_issue_photos(issue_id, organisation_id, object_path, created_at)
select id, organisation_id, organisation_id || '/' || id || '/rectified.jpg', now() - interval '10 days'
from public.supervisor_issues where inspection_id = 'e4000000-0000-0000-0000-000000000001';
select test.assert((select count(*) = 1 from public.supervisor_issue_photos where object_path like '%/rectified.jpg' and created_at > now() - interval '1 minute'),
  'a stored photograph is recorded with server time, not a client-supplied time');
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000003"}', true);
select test.assert((select (public.transition_supervisor_issue(id, 'close_after_reinspection', 'Physically reinspected; dry and clean')).state = 'closed'
  from public.supervisor_issues where inspection_id = 'e4000000-0000-0000-0000-000000000001'),
  'independent reviewer can close once genuine stored evidence exists');

select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000004"}', true);
select test.assert((select count(*) = 0 from public.supervisor_inspections), 'installer cannot read supervisor inspections');
reset role;

select test.assert(not has_function_privilege('authenticated', 'private.inspection_issues()', 'execute')
  and not has_function_privilege('authenticated', 'private.enforce_issue_closure()', 'execute')
  and not has_function_privilege('anon', 'private.guard_issue_photo()', 'execute'),
  'internal trigger functions are not executable by application roles');
select test.assert(true, 'supervisor records hardening PASSED');
rollback;
