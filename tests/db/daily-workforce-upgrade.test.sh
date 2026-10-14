#!/usr/bin/env bash
# Applies the Phase 2B daily workforce migration over allocation records made
# with the earlier functions, as the live database holds them. Proves every
# existing value is kept, the append-only rules still hold, the read-only
# preflight report is accurate, and a second run is refused.
set -euo pipefail
psql_binary="$1"
test_socket="$2"
test_port="$3"
repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
workforce_migration=20261014120000
base=("$psql_binary" -X -q -A -t -w -h "$test_socket" -p "$test_port" -U postgres -v ON_ERROR_STOP=1)
"${base[@]}" -d postgres -c 'create database daily_workforce_upgrade' >/dev/null
trap '"${base[@]}" -d postgres -c "drop database if exists daily_workforce_upgrade" >/dev/null 2>&1 || true' EXIT
psql=("${base[@]}" -d daily_workforce_upgrade)

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

snapshot() {
  "${psql[@]}" <<'SQL'
select string_agg(t || ':' || h, E'\n' order by t) from (
  select 'planned_allocations' t, md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by id), '')) h from public.planned_allocations x
  union all select 'planned_allocation_operatives', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by id), '')) from public.planned_allocation_operatives x
  union all select 'actual_allocations', md5(coalesce(string_agg((to_jsonb(x) - 'lead_operative_id')::text, '|' order by id), '')) from public.actual_allocations x
  union all select 'actual_allocation_operatives', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by id), '')) from public.actual_allocation_operatives x
  union all select 'allocation_absences', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by id), '')) from public.allocation_absences x
  union all select 'audit_events', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by id), '')) from public.audit_events x
) s;
SQL
}
preflight() {
  printf 'begin transaction read only;\n\\i %s\nrollback;\n' "$repository_root/supabase/inspection/supervisor-daily-workforce-preflight.sql" | "${psql[@]}" -F '|'
}
report_value() { grep -F "$1" <<<"$2" | head -1 | awk -F'|' '{print $4}'; }

report_before="$(preflight)"
if grep -qE 'MISSING|ALREADY EXISTS' <<<"$report_before" || [[ "$(report_value 'periods of work still open' "$report_before")" != 1
  || "$(report_value 'started on an earlier day' "$report_before")" != 1 || "$(report_value 'absences that contradict' "$report_before")" != 1 ]]; then
  echo "$report_before" >&2
  echo 'FAIL: the daily workforce preflight did not report the existing records correctly.' >&2
  exit 1
fi
before="$(snapshot)"
migration_file="$(ls "$repository_root"/supabase/migrations/${workforce_migration}_*.sql)"
"${psql[@]}" -f "$migration_file" >/dev/null
after="$(snapshot)"
if [[ "$before" != "$after" ]]; then
  diff <(echo "$before") <(echo "$after") >&2 || true
  echo 'FAIL: the daily workforce migration changed existing allocation, attendance, absence or audit records.' >&2
  exit 1
fi
report_after="$(preflight)"
if [[ "$(grep -c 'ALREADY EXISTS' <<<"$report_after")" != 8 ]] || [[ "$(grep '^row count' <<<"$report_before")" != "$(grep '^row count' <<<"$report_after")" ]]; then
  diff <(echo "$report_before") <(echo "$report_after") >&2 || true
  echo 'FAIL: the preflight after applying should show every new object and unchanged row counts.' >&2
  exit 1
fi
if "${psql[@]}" -f "$migration_file" >"$test_socket/workforce-reapply.log" 2>&1 || ! grep -q 'Preflight failed' "$test_socket/workforce-reapply.log" \
  || [[ "$(snapshot)" != "$after" ]]; then
  cat "$test_socket/workforce-reapply.log" >&2
  echo 'FAIL: the daily workforce migration did not refuse to run a second time.' >&2
  exit 1
fi

"${psql[@]}" <<'SQL'
select test.assert(true, 'the read-only daily workforce preflight reports open, unfinished and contradictory legacy records accurately before applying');
select test.assert(true, 'every existing plan, allocation, attendance, absence and audit record is unchanged by the daily workforce migration');
select test.assert(true, 'after applying, the preflight shows every new object and identical row counts');
select test.assert(true, 'the daily workforce migration refuses to run a second time, changing nothing');
select test.assert((select bool_and(lead_operative_id is null) from public.actual_allocations), 'existing allocations have no acting lead recorded, rather than an invented one');
select test.assert((select count(*) = 1 from public.allocation_absences where voided_at is null), 'an existing absence is not voided by the migration');
select test.expect_error($q$update public.actual_allocations set ended_at = now() where ended_at is not null$q$, array['42501'],
  'a recorded end time still cannot be rewritten after the upgrade');
SQL
"${psql[@]}" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a8100000-0000-4000-8000-000000000002"}', true) is not null;
select test.assert(public.end_open_allocations('a8000000-0000-4000-8000-000000000002', ((private.site_today() - 1) + time '18:00') at time zone 'Europe/London') = 1,
  'yesterday''s unfinished work, recorded before the upgrade, can be finished at the time it stopped');
rollback;
SQL
