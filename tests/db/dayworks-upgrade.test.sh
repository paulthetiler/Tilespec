#!/usr/bin/env bash
# Prove the dayworks migration keeps every saved record exactly as it was, keeps all
# original grants and policies, refuses a second application, and also installs where
# job messages (M1) have not been applied.
# This script receives only the disposable runner's private local Unix socket.
set -euo pipefail
psql_binary="$1"
test_socket="$2"
test_port="$3"
repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
migration="$repository_root/supabase/migrations/20261028090000_dayworks.sql"
preflight="$repository_root/supabase/inspection/dayworks-preflight.sql"
base=("$psql_binary" -X -q -A -t -w -h "$test_socket" -p "$test_port" -U postgres -v ON_ERROR_STOP=1)
"${base[@]}" -d postgres -c 'create database dayworks_upgrade' >/dev/null
"${base[@]}" -d postgres -c 'create database dayworks_without_messages' >/dev/null
trap '"${base[@]}" -d postgres -c "drop database if exists dayworks_upgrade" >/dev/null 2>&1 || true
  "${base[@]}" -d postgres -c "drop database if exists dayworks_without_messages" >/dev/null 2>&1 || true' EXIT
psql=("${base[@]}" -d dayworks_upgrade)
without=("${base[@]}" -d dayworks_without_messages)
for target in dayworks_upgrade dayworks_without_messages; do
  sed '/^create role/d' "$repository_root/tests/db/platform.sql" | "${base[@]}" -d "$target" >/dev/null
done
for earlier in "$repository_root"/supabase/migrations/*.sql; do
  name="$(basename "$earlier")"
  if [[ "$name" < 20261028090000 ]]; then
    "${psql[@]}" -f "$earlier" >/dev/null
    if [[ "$name" != 20261024090000_job_messages.sql ]]; then "${without[@]}" -f "$earlier" >/dev/null; fi
  fi
done
"${psql[@]}" >/dev/null <<'SQL'
begin;
insert into auth.users(id,email) values
 ('dd610000-0000-4000-8000-000000000001','dayworks-upgrade-owner@example.invalid'),
 ('dd610000-0000-4000-8000-000000000002','dayworks-upgrade-supervisor@example.invalid');
insert into public.organisations(id,name) values('dd620000-0000-4000-8000-000000000001','Dayworks upgrade fixture');
insert into public.organisation_members(organisation_id,user_id,display_name,role) values
 ('dd620000-0000-4000-8000-000000000001','dd610000-0000-4000-8000-000000000001','Upgrade owner','owner'),
 ('dd620000-0000-4000-8000-000000000001','dd610000-0000-4000-8000-000000000002','Upgrade supervisor','supervisor');
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 ('dd630000-0000-4000-8000-000000000001','dd620000-0000-4000-8000-000000000001','DAYWORKS-UPGRADE','Existing fictional site','dd610000-0000-4000-8000-000000000001');
insert into public.contract_assignments(organisation_id,contract_id,user_id) values
 ('dd620000-0000-4000-8000-000000000001','dd630000-0000-4000-8000-000000000001','dd610000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd610000-0000-4000-8000-000000000001"}',true);
select public.save_contract_commercial('dd630000-0000-4000-8000-000000000001',0,
 '{"contract_value":120000,"labour_budget":40000,"materials_budget":30000,"preliminaries_budget":5000,"contingency":2000,"target_margin":25}'::jsonb);
select public.create_supervisor_office_item(gen_random_uuid(),jsonb_build_object('contract_id','dd630000-0000-4000-8000-000000000001','kind','instruction',
 'title','Existing instruction','body','Existing instruction body','recipient_id','dd610000-0000-4000-8000-000000000002','acknowledgement_required',true));
select set_config('request.jwt.claims','{"sub":"dd610000-0000-4000-8000-000000000002"}',true);
select public.post_job_message(gen_random_uuid(),jsonb_build_object('contract_id','dd630000-0000-4000-8000-000000000001',
 'body','Existing question about the job','needs_answer',true));
select public.record_site_handover(gen_random_uuid(),jsonb_build_object('contract_id','dd630000-0000-4000-8000-000000000001',
 'work_completed','Existing work','office_notes','Possible daywork: bin store wall','finish_workforce',false));
commit;
create table test.dayworks_original_tables as select n.nspname as schema_name,c.relname as table_name,
  c.relacl::text as grants,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private','auth','storage') and c.relkind='r';
create table test.dayworks_original_policies as select * from pg_policies where schemaname in ('public','private','auth','storage');
SQL
snapshot() {
  "${psql[@]}" <<'SQL'
select schema_name||'.'||table_name||':'||(xpath('/row/hash/text()',query_to_xml(format(
 'select md5(coalesce(string_agg(to_jsonb(x)::text,''|'' order by to_jsonb(x)::text),'''')) hash from %I.%I x',
 schema_name,table_name),false,true,'')))[1]::text from test.dayworks_original_tables order by schema_name,table_name;
SQL
}
before="$(snapshot)"
"${psql[@]}" -f "$preflight" >"$test_socket/dayworks-preflight-before.log"
"${psql[@]}" -f "$migration" >/dev/null
if [[ "$before" != "$(snapshot)" ]]; then echo 'FAIL: dayworks migration changed original values.' >&2; exit 1; fi
"${psql[@]}" <<'SQL'
select test.assert(not exists(select 1 from test.dayworks_original_tables t join pg_namespace n on n.nspname=t.schema_name
 join pg_class c on c.relnamespace=n.oid and c.relname=t.table_name
 where c.relacl::text is distinct from t.grants or c.relrowsecurity<>t.relrowsecurity or c.relforcerowsecurity<>t.relforcerowsecurity),
 'dayworks preserve every original table grant and row-level security flag');
select test.assert(not exists((select * from test.dayworks_original_policies except select * from pg_policies)),
 'dayworks preserve every original row-level security policy');
select test.assert((select count(*)=1 from public.contract_commercials) and (select count(*)=1 from public.supervisor_office_items)
 and (select count(*)=1 from public.job_messages) and (select count(*)=1 from public.site_handovers)
 and (select count(*)=0 from public.dayworks) and (select count(*)=0 from public.contract_daywork_rates),
 'existing budgets, messages, conversations and handovers are kept, and no daywork or rate is invented');
select test.assert(pg_get_constraintdef((select oid from pg_constraint where conname='job_messages_about_type_check')) like '%daywork%',
 'installed job messages may now be about a daywork, with every earlier kind kept');
select test.assert(true,'dayworks upgrade preserves every original public/private/auth/storage value');
SQL
"${psql[@]}" -f "$preflight" >"$test_socket/dayworks-preflight-after.log"
if ! diff <(tail -n 4 "$test_socket/dayworks-preflight-before.log") <(tail -n 4 "$test_socket/dayworks-preflight-after.log") >/dev/null; then
  echo 'FAIL: read-only dayworks preflight changed preserved counts.' >&2; exit 1
fi
if "${psql[@]}" -f "$migration" >"$test_socket/dayworks-reapply.log" 2>&1 \
  || ! grep -q 'Preflight failed' "$test_socket/dayworks-reapply.log" || [[ "$before" != "$(snapshot)" ]]; then
  echo 'FAIL: dayworks migration reapplication did not safely refuse without changing history.' >&2; exit 1
fi
"${psql[@]}" -c "select test.assert(true,'dayworks migration refuses a second application, and its read-only preflight changes no history');"
"${without[@]}" -f "$migration" >/dev/null
"${without[@]}" -c "select test.assert(to_regclass('public.dayworks') is not null and to_regclass('public.job_messages') is null,
 'dayworks install where job messages are not applied, and do not create them');"
