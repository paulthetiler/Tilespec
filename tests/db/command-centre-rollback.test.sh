#!/usr/bin/env bash
# The office command centre installs, rolls back cleanly to the previous schema (existing records and
# messages kept) and installs again. Disposable local database only.
set -euo pipefail
psql_bin="$1"; socket="$2"; port="$3"
repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
base=("$psql_bin" -X -q -w -h "$socket" -p "$port" -U postgres -v ON_ERROR_STOP=1)
"${base[@]}" -d postgres -c 'create database command_centre_rollback' >/dev/null
trap '"${base[@]}" -d postgres -c "drop database if exists command_centre_rollback" >/dev/null 2>&1 || true' EXIT
psql=("${base[@]}" -d command_centre_rollback)
grep -v '^create role' "$repository_root/tests/db/platform.sql" | "${psql[@]}" >/dev/null
for migration in "$repository_root"/supabase/migrations/*.sql; do "${psql[@]}" -f "$migration" >/dev/null; done
"${psql[@]}" >/dev/null <<'SQL'
insert into auth.users(id,email) values ('cd510000-0000-4000-8000-000000000001','rollback-owner@example.invalid'),('cd510000-0000-4000-8000-000000000002','rollback-sup@example.invalid');
insert into public.organisations(id,name) values ('cd520000-0000-4000-8000-000000000001','Rollback test');
insert into public.organisation_members(organisation_id,user_id,display_name,role) values
 ('cd520000-0000-4000-8000-000000000001','cd510000-0000-4000-8000-000000000001','Rollback owner','owner'),
 ('cd520000-0000-4000-8000-000000000001','cd510000-0000-4000-8000-000000000002','Rollback supervisor','supervisor');
insert into public.contracts(id,organisation_id,reference,name,client,created_by) values
 ('cd530000-0000-4000-8000-000000000001','cd520000-0000-4000-8000-000000000001','RB-1','Rollback site','Rollback Client','cd510000-0000-4000-8000-000000000001');
insert into public.contract_assignments(organisation_id,contract_id,user_id) values ('cd520000-0000-4000-8000-000000000001','cd530000-0000-4000-8000-000000000001','cd510000-0000-4000-8000-000000000002');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"cd510000-0000-4000-8000-000000000002"}',false);
select public.post_job_message(gen_random_uuid(),'{"contract_id":"cd530000-0000-4000-8000-000000000001","body":"Kept after rollback","category":"question"}');
select public.request_material(gen_random_uuid(),'{"contract_id":"cd530000-0000-4000-8000-000000000001","item":"Grout","quantity":2,"unit":"bag"}');
reset role;
SQL
before="$("${psql[@]}" -At -c "select md5(string_agg((to_jsonb(c)-'customer_id'-'lifecycle_stage'-'version'-'updated_at')::text,'|' order by id)) from public.contracts c")"
"${psql[@]}" -f "$repository_root/supabase/rollback/20261114090000_office_command_centre_down.sql" >/dev/null
"${psql[@]}" -c "select test.assert(to_regclass('public.quotes') is null and to_regclass('public.notification_outbox') is null
  and not exists(select 1 from information_schema.columns where table_name='contracts' and column_name in ('customer_id','lifecycle_stage'))
  and not exists(select 1 from information_schema.columns where table_name='job_messages' and column_name in ('category','urgent'))
  and (select count(*)=1 from public.job_messages where body='Kept after rollback'),'the rollback removes only the command centre and keeps the conversation')" >/dev/null
after="$("${psql[@]}" -At -c "select md5(string_agg((to_jsonb(c)-'version'-'updated_at')::text,'|' order by id)) from public.contracts c")"
[[ "$before" == "$after" ]] || { echo 'FAIL: the rollback changed existing jobs.' >&2; exit 1; }
"${psql[@]}" -f "$repository_root/supabase/migrations/20261114090000_office_command_centre.sql" >/dev/null
"${psql[@]}" -c "select test.assert(to_regclass('public.quotes') is not null,'the office command centre installs again after a rollback')"
