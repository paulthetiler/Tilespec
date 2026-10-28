#!/usr/bin/env bash
# Prove the job message migration keeps every saved record exactly as it was, keeps
# all original grants and policies, and refuses a second application.
# This script receives only the disposable runner's private local Unix socket.
set -euo pipefail
psql_binary="$1"
test_socket="$2"
test_port="$3"
repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
migration="$repository_root/supabase/migrations/20261024090000_job_messages.sql"
preflight="$repository_root/supabase/inspection/job-messages-preflight.sql"
base=("$psql_binary" -X -q -A -t -w -h "$test_socket" -p "$test_port" -U postgres -v ON_ERROR_STOP=1)
"${base[@]}" -d postgres -c 'create database job_messages_upgrade' >/dev/null
trap '"${base[@]}" -d postgres -c "drop database if exists job_messages_upgrade" >/dev/null 2>&1 || true' EXIT
psql=("${base[@]}" -d job_messages_upgrade)
sed '/^create role/d' "$repository_root/tests/db/platform.sql" | "${psql[@]}" >/dev/null
for earlier in "$repository_root"/supabase/migrations/*.sql; do
  if [[ "$(basename "$earlier")" < 20261024090000 ]]; then "${psql[@]}" -f "$earlier" >/dev/null; fi
done
"${psql[@]}" >/dev/null <<'SQL'
begin;
insert into auth.users(id,email) values
 ('db610000-0000-4000-8000-000000000001','messages-upgrade-office@example.invalid'),
 ('db610000-0000-4000-8000-000000000002','messages-upgrade-supervisor@example.invalid');
insert into public.organisations(id,name) values('db620000-0000-4000-8000-000000000001','Messages upgrade fixture');
insert into public.organisation_members(organisation_id,user_id,display_name,role) values
 ('db620000-0000-4000-8000-000000000001','db610000-0000-4000-8000-000000000001','Upgrade office','owner'),
 ('db620000-0000-4000-8000-000000000001','db610000-0000-4000-8000-000000000002','Upgrade supervisor','supervisor');
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 ('db630000-0000-4000-8000-000000000001','db620000-0000-4000-8000-000000000001','MESSAGES-UPGRADE','Existing fictional site','db610000-0000-4000-8000-000000000001');
insert into public.contract_assignments(organisation_id,contract_id,user_id) values
 ('db620000-0000-4000-8000-000000000001','db630000-0000-4000-8000-000000000001','db610000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"db610000-0000-4000-8000-000000000001"}',true);
select public.create_locations('db630000-0000-4000-8000-000000000001',gen_random_uuid(),null,'[{"name":"Existing room"}]');
select id as room from public.work_areas \gset
select public.create_location_inspection_template(gen_random_uuid(),jsonb_build_object('contract_id','db630000-0000-4000-8000-000000000001',
 'work_area_id',:'room','stage','installation','title','Existing template','specification_reference','EXISTING-SPEC','specification_revision','A','wet_area',false,
 'checklist','[{"label":"Existing workmanship","wet_only":false}]'::jsonb)) as template \gset
select public.create_supervisor_office_item(gen_random_uuid(),jsonb_build_object('contract_id','db630000-0000-4000-8000-000000000001','kind','instruction',
 'title','Existing instruction','body','Existing instruction body','recipient_id','db610000-0000-4000-8000-000000000002','acknowledgement_required',true)) as message \gset
select public.create_supervisor_office_item(gen_random_uuid(),jsonb_build_object('contract_id','db630000-0000-4000-8000-000000000001','kind','qa_request',
 'title','Existing request','body','Existing request body','recipient_id','db610000-0000-4000-8000-000000000002','work_area_id',:'room','stage','installation')) as qa \gset
select set_config('request.jwt.claims','{"sub":"db610000-0000-4000-8000-000000000002"}',true);
select public.acknowledge_supervisor_office_item(:'message','db640000-0000-4000-8000-000000000001');
select public.record_location_inspection(gen_random_uuid(),jsonb_build_object('contract_id','db630000-0000-4000-8000-000000000001',
 'work_area_id',:'room','template_id',:'template','answers','[{"status":"issue","note":"Existing workmanship concern"}]'::jsonb,'allocation_ids','[]'::jsonb)) as inspection \gset
select public.submit_supervisor_qa_result(:'qa',:'inspection',gen_random_uuid());
select public.record_site_handover(gen_random_uuid(),jsonb_build_object('contract_id','db630000-0000-4000-8000-000000000001',
 'work_completed','Existing work','outstanding_problems','Existing problem','finish_workforce',false));
commit;
create table test.messages_original_tables as select n.nspname as schema_name,c.relname as table_name,
  c.relacl::text as grants,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private','auth','storage') and c.relkind='r';
create table test.messages_original_policies as select * from pg_policies where schemaname in ('public','private','auth','storage');
SQL
snapshot() {
  "${psql[@]}" <<'SQL'
select schema_name||'.'||table_name||':'||(xpath('/row/hash/text()',query_to_xml(format(
 'select md5(coalesce(string_agg(to_jsonb(x)::text,''|'' order by to_jsonb(x)::text),'''')) hash from %I.%I x',
 schema_name,table_name),false,true,'')))[1]::text from test.messages_original_tables order by schema_name,table_name;
SQL
}
before="$(snapshot)"
"${psql[@]}" -f "$preflight" >"$test_socket/messages-preflight-before.log"
"${psql[@]}" -f "$migration" >/dev/null
if [[ "$before" != "$(snapshot)" ]]; then echo 'FAIL: job message migration changed original values.' >&2; exit 1; fi
"${psql[@]}" <<'SQL'
select test.assert(not exists(select 1 from test.messages_original_tables t join pg_namespace n on n.nspname=t.schema_name
 join pg_class c on c.relnamespace=n.oid and c.relname=t.table_name
 where c.relacl::text is distinct from t.grants or c.relrowsecurity<>t.relrowsecurity or c.relforcerowsecurity<>t.relforcerowsecurity),
 'job messages preserve every original table grant and row-level security flag');
select test.assert(not exists((select * from test.messages_original_policies except select * from pg_policies)),
 'job messages preserve every original row-level security policy');
select test.assert((select count(*)=2 from public.supervisor_office_items) and (select count(*)=1 from public.supervisor_office_acknowledgements)
 and (select count(*)=1 from public.supervisor_qa_submissions) and (select count(*)=1 from public.site_handovers) and (select count(*)=0 from public.job_messages),
 'existing messages, acknowledgements, results and handovers are kept, and no conversation is invented');
select test.assert(true,'job message upgrade preserves every original public/private/auth/storage value');
SQL
"${psql[@]}" -f "$preflight" >"$test_socket/messages-preflight-after.log"
if ! diff <(tail -n 4 "$test_socket/messages-preflight-before.log") <(tail -n 4 "$test_socket/messages-preflight-after.log") >/dev/null; then
  echo 'FAIL: read-only job message preflight changed preserved counts.' >&2; exit 1
fi
if "${psql[@]}" -f "$migration" >"$test_socket/messages-reapply.log" 2>&1 \
  || ! grep -q 'Preflight failed' "$test_socket/messages-reapply.log" || [[ "$before" != "$(snapshot)" ]]; then
  echo 'FAIL: job message migration reapplication did not safely refuse without changing history.' >&2; exit 1
fi
"${psql[@]}" -c "select test.assert(true,'job message migration refuses a second application, and its read-only preflight changes no history');"
