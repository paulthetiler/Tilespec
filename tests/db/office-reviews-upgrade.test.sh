#!/usr/bin/env bash
# Prove the office review and instruction change migration keeps every saved
# message, acknowledgement, inspection result and handover exactly as it was, keeps
# all original grants and policies, and lets a saved acknowledgement be retried.
# This script receives only the disposable runner's private local Unix socket.
set -euo pipefail
psql_binary="$1"
test_socket="$2"
test_port="$3"
repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
migration="$repository_root/supabase/migrations/20261023090000_office_reviews_instruction_changes.sql"
preflight="$repository_root/supabase/inspection/office-reviews-preflight.sql"
base=("$psql_binary" -X -q -A -t -w -h "$test_socket" -p "$test_port" -U postgres -v ON_ERROR_STOP=1)
"${base[@]}" -d postgres -c 'create database office_reviews_upgrade' >/dev/null
trap '"${base[@]}" -d postgres -c "drop database if exists office_reviews_upgrade" >/dev/null 2>&1 || true' EXIT
psql=("${base[@]}" -d office_reviews_upgrade)
sed '/^create role/d' "$repository_root/tests/db/platform.sql" | "${psql[@]}" >/dev/null
for earlier in "$repository_root"/supabase/migrations/*.sql; do
  if [[ "$(basename "$earlier")" < 20261023090000 ]]; then "${psql[@]}" -f "$earlier" >/dev/null; fi
done
"${psql[@]}" >/dev/null <<'SQL'
begin;
insert into auth.users(id,email) values
 ('db410000-0000-4000-8000-000000000001','review-upgrade-office@example.invalid'),
 ('db410000-0000-4000-8000-000000000002','review-upgrade-supervisor@example.invalid');
insert into public.organisations(id,name) values('db420000-0000-4000-8000-000000000001','Review upgrade fixture');
insert into public.organisation_members(organisation_id,user_id,display_name,role) values
 ('db420000-0000-4000-8000-000000000001','db410000-0000-4000-8000-000000000001','Upgrade office','owner'),
 ('db420000-0000-4000-8000-000000000001','db410000-0000-4000-8000-000000000002','Upgrade supervisor','supervisor');
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 ('db430000-0000-4000-8000-000000000001','db420000-0000-4000-8000-000000000001','REVIEW-UPGRADE','Existing fictional site','db410000-0000-4000-8000-000000000001');
insert into public.contract_assignments(organisation_id,contract_id,user_id) values
 ('db420000-0000-4000-8000-000000000001','db430000-0000-4000-8000-000000000001','db410000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"db410000-0000-4000-8000-000000000001"}',true);
select public.create_locations('db430000-0000-4000-8000-000000000001',gen_random_uuid(),null,'[{"name":"Existing room"}]');
select id as room from public.work_areas \gset
select public.create_location_inspection_template(gen_random_uuid(),jsonb_build_object('contract_id','db430000-0000-4000-8000-000000000001',
 'work_area_id',:'room','stage','installation','title','Existing template','specification_reference','EXISTING-SPEC','specification_revision','A','wet_area',false,
 'checklist','[{"label":"Existing workmanship","wet_only":false}]'::jsonb)) as template \gset
select public.create_supervisor_office_item(gen_random_uuid(),jsonb_build_object('contract_id','db430000-0000-4000-8000-000000000001','kind','instruction',
 'title','Existing instruction','body','Existing instruction body','recipient_id','db410000-0000-4000-8000-000000000002','acknowledgement_required',true)) as message \gset
select public.create_supervisor_office_item(gen_random_uuid(),jsonb_build_object('contract_id','db430000-0000-4000-8000-000000000001','kind','qa_request',
 'title','Existing request','body','Existing request body','recipient_id','db410000-0000-4000-8000-000000000002','work_area_id',:'room','stage','installation')) as qa \gset
select set_config('request.jwt.claims','{"sub":"db410000-0000-4000-8000-000000000002"}',true);
select public.acknowledge_supervisor_office_item(:'message','db440000-0000-4000-8000-000000000001');
select public.record_location_inspection(gen_random_uuid(),jsonb_build_object('contract_id','db430000-0000-4000-8000-000000000001',
 'work_area_id',:'room','template_id',:'template','answers','[{"status":"issue","note":"Existing workmanship concern"}]'::jsonb,'allocation_ids','[]'::jsonb)) as inspection \gset
select public.submit_supervisor_qa_result(:'qa',:'inspection',gen_random_uuid());
select public.record_site_handover(gen_random_uuid(),jsonb_build_object('contract_id','db430000-0000-4000-8000-000000000001',
 'work_completed','Existing work','outstanding_problems','Existing problem','finish_workforce',false));
commit;
create table test.review_original_tables as select n.nspname as schema_name,c.relname as table_name,
  c.relacl::text as grants,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private','auth','storage') and c.relkind='r';
create table test.review_original_policies as select * from pg_policies where schemaname in ('public','private','auth','storage');
SQL
# The two new message columns are left out of the comparison; every original value is compared.
snapshot() {
  "${psql[@]}" <<'SQL'
select schema_name||'.'||table_name||':'||(xpath('/row/hash/text()',query_to_xml(format(
 'select md5(coalesce(string_agg((to_jsonb(x)-''replaces_id''-''urgent'')::text,''|'' order by (to_jsonb(x)-''replaces_id''-''urgent'')::text),'''')) hash from %I.%I x',
 schema_name,table_name),false,true,'')))[1]::text from test.review_original_tables order by schema_name,table_name;
SQL
}
before="$(snapshot)"
"${psql[@]}" -f "$preflight" >"$test_socket/review-preflight-before.log"
"${psql[@]}" -f "$migration" >/dev/null
if [[ "$before" != "$(snapshot)" ]]; then echo 'FAIL: office review migration changed original values.' >&2; exit 1; fi
"${psql[@]}" <<'SQL'
select test.assert(not exists(select 1 from test.review_original_tables t join pg_namespace n on n.nspname=t.schema_name
 join pg_class c on c.relnamespace=n.oid and c.relname=t.table_name
 where c.relacl::text is distinct from t.grants or c.relrowsecurity<>t.relrowsecurity or c.relforcerowsecurity<>t.relforcerowsecurity),
 'office reviews preserve every original table grant and row-level security flag');
select test.assert(not exists((select * from test.review_original_policies except select * from pg_policies)),
 'office reviews preserve every original row-level security policy');
select test.assert((select count(*)=2 and bool_and(replaces_id is null and not urgent) from public.supervisor_office_items),
 'existing office messages read as not urgent and replacing nothing');
select test.assert((select count(*)=1 from public.supervisor_office_acknowledgements) and (select count(*)=1 from public.supervisor_qa_submissions)
 and (select count(*)=1 from public.site_handovers) and (select count(*)=0 from public.office_reviews) and (select count(*)=0 from public.supervisor_office_item_withdrawals),
 'existing acknowledgements, results and handovers are kept, and nothing is marked reviewed or withdrawn');
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"db410000-0000-4000-8000-000000000002"}',true);
select test.assert(public.acknowledge_supervisor_office_item(id,'db440000-0000-4000-8000-000000000001')
 =(select a.id from public.supervisor_office_acknowledgements a where a.item_id=i.id),
 'an acknowledgement saved before the upgrade can still be retried safely') from public.supervisor_office_items i where kind='instruction';
rollback;
select test.assert(true,'office review upgrade preserves every original public/private/auth/storage value');
SQL
"${psql[@]}" -f "$preflight" >"$test_socket/review-preflight-after.log"
if ! diff <(tail -n 4 "$test_socket/review-preflight-before.log") <(tail -n 4 "$test_socket/review-preflight-after.log") >/dev/null; then
  echo 'FAIL: read-only office review preflight changed preserved counts.' >&2; exit 1
fi
if "${psql[@]}" -f "$migration" >"$test_socket/review-reapply.log" 2>&1 \
  || ! grep -q 'Preflight failed' "$test_socket/review-reapply.log" || [[ "$before" != "$(snapshot)" ]]; then
  echo 'FAIL: office review migration reapplication did not safely refuse without changing history.' >&2; exit 1
fi
"${psql[@]}" -c "select test.assert(true,'office review migration refuses a second application, and its read-only preflight changes no history');"
