#!/usr/bin/env bash
# Apply Phase 3A over existing workforce history and prove all earlier data,
# grants and policies are preserved. Runs only in a disposable local database.
set -euo pipefail
psql_binary="$1"
test_socket="$2"
test_port="$3"
repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
workforce_migration=20261014140000
base=("$psql_binary" -X -q -A -t -w -h "$test_socket" -p "$test_port" -U postgres -v ON_ERROR_STOP=1)
"${base[@]}" -d postgres -c 'create database location_inspections_upgrade' >/dev/null
trap '"${base[@]}" -d postgres -c "drop database if exists location_inspections_upgrade" >/dev/null 2>&1 || true' EXIT
psql=("${base[@]}" -d location_inspections_upgrade)

grep -v '^create role' "$repository_root/tests/db/platform.sql" | "${psql[@]}" >/dev/null
for migration in "$repository_root"/supabase/migrations/*.sql; do
  [[ "$(basename "$migration")" < "$workforce_migration" ]] && "${psql[@]}" -f "$migration" >/dev/null
done

# Yesterday's site records, made with the functions that existed before Phase 2B.
"${psql[@]}" >/dev/null <<'SQL'
begin;
insert into auth.users(id, email) values ('a8100000-0000-4000-8000-000000000001', 'up-manager@example.invalid'), ('a8100000-0000-4000-8000-000000000002', 'up-supervisor@example.invalid');
insert into public.organisations(id, name) values ('a8000000-0000-4000-8000-000000000001', 'Upgrade contractor');
insert into public.organisation_members(organisation_id, user_id, display_name, role, financial_access) values
  ('a8000000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000001', 'Manager', 'contracts_manager', false),
  ('a8000000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000002', 'Supervisor', 'supervisor', false);
insert into public.contracts(id, organisation_id, reference, name, created_by) values
  ('a8000000-0000-4000-8000-000000000002', 'a8000000-0000-4000-8000-000000000001', 'UP-1', 'Upgrade site', 'a8100000-0000-4000-8000-000000000001');
insert into public.contract_assignments(contract_id, organisation_id, user_id) values
  ('a8000000-0000-4000-8000-000000000002', 'a8000000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000001'),
  ('a8000000-0000-4000-8000-000000000002', 'a8000000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a8100000-0000-4000-8000-000000000001"}', true);
select public.create_locations('a8000000-0000-4000-8000-000000000002', gen_random_uuid(), null, '[{"name":"Flat 1"},{"name":"Flat 2"}]');
select public.create_team('a8200000-0000-4000-8000-000000000001', '{"name":"Upgrade Gang","kind":"mixed"}');
select public.create_operative('a8200000-0000-4000-8000-000000000002', '{"display_name":"Ann Able","engagement":"direct_employee"}');
select public.create_operative('a8200000-0000-4000-8000-000000000003', '{"display_name":"Bob Best","engagement":"direct_employee"}');
select public.create_operative('a8200000-0000-4000-8000-000000000004', '{"display_name":"Cal Cole","engagement":"direct_employee"}');
select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', (select id from public.teams), 'operative_id', o.id, 'valid_from', (private.site_today() - 30)::text))
  from public.operatives o;
select public.plan_allocation('a8200000-0000-4000-8000-000000000005', jsonb_build_object('contract_id', 'a8000000-0000-4000-8000-000000000002',
  'work_area_id', (select id from public.work_areas where name = 'Flat 1'), 'team_id', (select id from public.teams), 'stage', 'installation',
  'planned_start', (private.site_today() - 1)::text, 'planned_end', private.site_today()::text,
  'operative_ids', (select jsonb_agg(id) from public.operatives where display_name in ('Ann Able', 'Bob Best', 'Cal Cole'))));
select set_config('request.jwt.claims', '{"sub":"a8100000-0000-4000-8000-000000000002"}', true);
select public.record_actual_allocation('a8200000-0000-4000-8000-000000000006', jsonb_build_object('contract_id', 'a8000000-0000-4000-8000-000000000002',
  'planned_allocation_id', (select id from public.planned_allocations), 'reason', 'Cal off sick',
  'operative_ids', (select jsonb_agg(id) from public.operatives where display_name in ('Ann Able', 'Bob Best')),
  'started_at', to_jsonb(((private.site_today() - 1) + time '08:00') at time zone 'Europe/London')));
select public.record_allocation_absence('a8200000-0000-4000-8000-000000000007', jsonb_build_object('planned_allocation_id', (select id from public.planned_allocations),
  'work_date', (private.site_today() - 1)::text, 'operative_id', (select id from public.operatives where display_name = 'Cal Cole'), 'reason', 'Off sick'));
select public.end_actual_allocation((select id from public.actual_allocations), ((private.site_today() - 1) + time '16:00') at time zone 'Europe/London');
-- Unplanned work yesterday that nobody finished.
select public.record_actual_allocation('a8200000-0000-4000-8000-000000000008', jsonb_build_object('contract_id', 'a8000000-0000-4000-8000-000000000002',
  'work_area_id', (select id from public.work_areas where name = 'Flat 2'), 'stage', 'remedial', 'reason', 'Snag call-out',
  'operative_ids', (select jsonb_agg(id) from public.operatives where display_name = 'Cal Cole'),
  'started_at', to_jsonb(((private.site_today() - 1) + time '17:00') at time zone 'Europe/London')));
commit;
SQL

# Record every existing table, including private idempotency and audit history.
"${psql[@]}" -c "create table test.existing_tables as select schemaname,tablename from pg_tables where schemaname in ('public','private');" >/dev/null
snapshot() {
  "${psql[@]}" <<'SQL'
select string_agg(schemaname||'.'||tablename||':'||
  (xpath('/row/hash/text()',query_to_xml(format('select md5(coalesce(string_agg(to_jsonb(x)::text, ''|'' order by to_jsonb(x)::text), '''')) as hash from %I.%I x',schemaname,tablename),false,true,'')))[1]::text,E'\n' order by schemaname,tablename)
from test.existing_tables;
select string_agg(p::text,E'\n' order by p::text) from pg_policies p join test.existing_tables t using(schemaname,tablename);
select string_agg(c.oid::text||':'||coalesce(c.relacl::text,''),E'\n' order by c.oid)
from pg_class c join pg_namespace n on n.oid=c.relnamespace join test.existing_tables t on t.schemaname=n.nspname and t.tablename=c.relname;
SQL
}
before="$(snapshot)"
migration_file="$repository_root/supabase/migrations/20261014140000_location_inspections.sql"
"${psql[@]}" -f "$repository_root/supabase/inspection/location-inspections-preflight.sql" >"$test_socket/inspections-before.log"
if grep -qE 'MISSING|ALREADY EXISTS' "$test_socket/inspections-before.log"; then
  cat "$test_socket/inspections-before.log" >&2
  exit 1
fi
"${psql[@]}" -f "$migration_file" >/dev/null
[[ "$before" == "$(snapshot)" ]] || { echo 'FAIL: Phase 3A changed earlier rows, policies or grants' >&2; exit 1; }
echo 'NOTICE:  ok - Phase 3A preserves every existing public/private record, grant and policy'
"${psql[@]}" -f "$repository_root/supabase/inspection/location-inspections-preflight.sql" >"$test_socket/inspections-after.log"
[[ "$(rg -c 'ALREADY EXISTS' "$test_socket/inspections-after.log")" == 5 ]] || { cat "$test_socket/inspections-after.log" >&2; exit 1; }
if "${psql[@]}" -f "$migration_file" >"$test_socket/inspections-reapply.log" 2>&1 || ! rg -q 'Preflight failed' "$test_socket/inspections-reapply.log"; then
  cat "$test_socket/inspections-reapply.log" >&2
  exit 1
fi
[[ "$before" == "$(snapshot)" ]] || exit 1
echo 'NOTICE:  ok - read-only preflight identifies every new object and migration refuses a second application without changing history'
