#!/usr/bin/env bash
# Prove the new daily inbox/handover migration preserves populated Phase 3C
# records, all original table grants/policies and the ten-answer morning format.
# This script receives only the disposable runner's private local Unix socket.
set -euo pipefail
psql_binary="$1"
test_socket="$2"
test_port="$3"
repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
base=("$psql_binary" -X -q -A -t -w -h "$test_socket" -p "$test_port" -U postgres -v ON_ERROR_STOP=1)
"${base[@]}" -d postgres -c 'create database supervisor_daily_upgrade' >/dev/null
trap '"${base[@]}" -d postgres -c "drop database if exists supervisor_daily_upgrade" >/dev/null 2>&1 || true' EXIT
psql=("${base[@]}" -d supervisor_daily_upgrade)
sed '/^create role/d' "$repository_root/tests/db/platform.sql" | "${psql[@]}" >/dev/null
for migration in "$repository_root"/supabase/migrations/*.sql; do
  if [[ "$(basename "$migration")" < 20261015130000 ]]; then "${psql[@]}" -f "$migration" >/dev/null; fi
done
"${psql[@]}" >/dev/null <<'SQL'
begin;
insert into auth.users(id,email) values
 ('db210000-0000-4000-8000-000000000001','daily-upgrade-office@example.invalid'),
 ('db210000-0000-4000-8000-000000000002','daily-upgrade-supervisor@example.invalid');
insert into public.organisations(id,name) values('db220000-0000-4000-8000-000000000001','Daily upgrade fixture');
insert into public.organisation_members(organisation_id,user_id,display_name,role) values
 ('db220000-0000-4000-8000-000000000001','db210000-0000-4000-8000-000000000001','Upgrade office','owner'),
 ('db220000-0000-4000-8000-000000000001','db210000-0000-4000-8000-000000000002','Upgrade supervisor','supervisor');
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 ('db230000-0000-4000-8000-000000000001','db220000-0000-4000-8000-000000000001','DAILY-UPGRADE','Existing fictional site','db210000-0000-4000-8000-000000000001');
insert into public.contract_assignments(organisation_id,contract_id,user_id) values
 ('db220000-0000-4000-8000-000000000001','db230000-0000-4000-8000-000000000001','db210000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"db210000-0000-4000-8000-000000000001"}',true);
select public.create_locations('db230000-0000-4000-8000-000000000001',gen_random_uuid(),null,'[{"name":"Historical room"}]');
select id as room from public.work_areas \gset
select public.create_location_inspection_template(gen_random_uuid(),jsonb_build_object('contract_id','db230000-0000-4000-8000-000000000001',
 'work_area_id',:'room','stage','installation','title','Historical template','specification_reference','HISTORIC-SPEC','specification_revision','A','wet_area',false,
 'checklist','[{"label":"Historical workmanship","wet_only":false}]'::jsonb)) as template \gset
select public.create_operative(gen_random_uuid(),'{"display_name":"Historic operative","engagement":"direct_employee"}') as worker \gset
select set_config('request.jwt.claims','{"sub":"db210000-0000-4000-8000-000000000002"}',true);
select public.record_actual_allocation(gen_random_uuid(),jsonb_build_object('contract_id','db230000-0000-4000-8000-000000000001',
 'work_area_id',:'room','stage','installation','operative_ids',jsonb_build_array(:'worker'),'started_at',to_jsonb(now()-interval '1 day'),'reason','Historical actual work')) as actual \gset
select public.end_actual_allocation(:'actual',now()-interval '23 hours');
select public.record_location_inspection(gen_random_uuid(),jsonb_build_object('contract_id','db230000-0000-4000-8000-000000000001',
 'work_area_id',:'room','template_id',:'template','answers','[{"status":"issue","note":"Historical workmanship concern"}]'::jsonb,'allocation_ids',jsonb_build_array(:'actual'))) as inspection \gset
insert into public.supervisor_inspections(organisation_id,contract_id,request_key,answers,issues_count)
 select 'db220000-0000-4000-8000-000000000001','db230000-0000-4000-8000-000000000001',gen_random_uuid(),
 jsonb_agg(jsonb_build_object('item','Existing check '||n,'status','pass','note','')),0 from generate_series(1,10) n;
select public.create_work_hold(gen_random_uuid(),jsonb_build_object('contract_id','db230000-0000-4000-8000-000000000001',
 'work_area_id',:'room','stage','installation','hold_type','quality','category','Historical quality concern','severity','major',
 'reason','An earlier inspection identified a workmanship problem','required_action','Investigate and correct the original workmanship concern',
 'source_inspection_id',:'inspection','document_ids','[]'::jsonb,'evidence_explanation','Original saved inspection provides the evidence'));
commit;
create table test.daily_original_tables as select n.nspname as schema_name,c.relname as table_name,
  c.relacl::text as grants,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private','auth','storage') and c.relkind='r';
create table test.daily_original_policies as select * from pg_policies where schemaname in ('public','private','auth','storage');
SQL
snapshot() {
  "${psql[@]}" <<'SQL'
select schema_name||'.'||table_name||':'||(xpath('/row/hash/text()',query_to_xml(format(
 'select md5(coalesce(string_agg(to_jsonb(x)::text,''|'' order by to_jsonb(x)::text),'''')) hash from %I.%I x',
 schema_name,table_name),false,true,'')))[1]::text from test.daily_original_tables order by schema_name,table_name;
SQL
}
before="$(snapshot)"
"${psql[@]}" -f "$repository_root/supabase/inspection/supervisor-daily-workflow-preflight.sql" >"$test_socket/daily-preflight-before.log"
"${psql[@]}" -f "$repository_root/supabase/migrations/20261015130000_supervisor_daily_workflow.sql" >/dev/null
if [[ "$before" != "$(snapshot)" ]]; then echo 'FAIL: daily workflow migration changed original values.' >&2; exit 1; fi
"${psql[@]}" <<'SQL'
select test.assert(not exists(select 1 from test.daily_original_tables t join pg_namespace n on n.nspname=t.schema_name
 join pg_class c on c.relnamespace=n.oid and c.relname=t.table_name
 where c.relacl::text is distinct from t.grants or c.relrowsecurity<>t.relrowsecurity or c.relforcerowsecurity<>t.relforcerowsecurity),
 'daily workflow preserves every original table grant and row-level security flag');
select test.assert(not exists((select * from test.daily_original_policies except select * from pg_policies)),
 'daily workflow preserves every original row-level security policy');
select test.assert((select count(*)=1 and bool_and(jsonb_array_length(answers)=10) from public.supervisor_inspections),
 'daily upgrade preserves existing ten-answer morning checks exactly');
select test.assert((select count(*)=1 and bool_and(status='active') from public.work_holds),
 'daily upgrade preserves existing Phase 3C quality restrictions');
select test.assert((select count(*)=1 from public.location_inspection_allocations),
 'daily upgrade retains the exact inspection-to-actual-workforce history links');
select test.assert(true,'daily upgrade preserves every original public/private/auth/storage value, including holds, decisions, inspection answers, attendance and request receipts');
SQL
"${psql[@]}" -f "$repository_root/supabase/inspection/supervisor-daily-workflow-preflight.sql" >"$test_socket/daily-preflight-after.log"
if ! diff <(tail -n 6 "$test_socket/daily-preflight-before.log") <(tail -n 6 "$test_socket/daily-preflight-after.log") >/dev/null; then
  echo 'FAIL: read-only daily preflight changed preserved counts.' >&2; exit 1
fi
if "${psql[@]}" -f "$repository_root/supabase/migrations/20261015130000_supervisor_daily_workflow.sql" >"$test_socket/daily-reapply.log" 2>&1 \
  || ! rg -q 'Preflight failed' "$test_socket/daily-reapply.log" || [[ "$before" != "$(snapshot)" ]]; then
  echo 'FAIL: daily migration reapplication did not safely refuse without changing history.' >&2; exit 1
fi
"${psql[@]}" -c "select test.assert(true,'daily workflow migration refuses a second application, and its read-only preflight changes no history');"
