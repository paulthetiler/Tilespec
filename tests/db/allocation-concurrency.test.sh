#!/usr/bin/env bash
# Two real connections confirm the same gang while the first transaction is
# still uncommitted: a same-key retry must return the same record, and a
# duplicate under a different key must be refused, never committed twice.
set -euo pipefail
psql_binary="$1"
test_socket="$2"
test_port="$3"
race_directory="$(mktemp -d "$test_socket/allocation-race.XXXXXXXX")"
psql=("$psql_binary" -X -q -A -t -w -h "$test_socket" -p "$test_port" -U postgres -d postgres -v ON_ERROR_STOP=1)
"${psql[@]}" <<'SQL'
begin;
insert into auth.users(id, email) values ('81000000-0000-0000-0000-000000000001', 'race-supervisor@example.invalid');
insert into public.organisations(id, name) values ('81000000-0000-0000-0000-000000000002', 'Allocation race fixture');
insert into public.organisation_members(organisation_id, user_id, display_name, role)
values ('81000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001', 'Race supervisor', 'supervisor');
insert into public.contracts(id, organisation_id, reference, name, created_by)
values ('81000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000002', 'RACE-1', 'Concurrent confirmation fixture', '81000000-0000-0000-0000-000000000001');
insert into public.contract_assignments(contract_id, organisation_id, user_id)
values ('81000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001');
insert into public.work_areas(id, organisation_id, contract_id, name, created_by)
values ('81000000-0000-0000-0000-000000000004', '81000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000003', 'Flat 52', '81000000-0000-0000-0000-000000000001');
insert into public.operatives(id, organisation_id, display_name, engagement)
values ('81000000-0000-0000-0000-000000000005', '81000000-0000-0000-0000-000000000002', 'Race Operative', 'subcontractor');
commit;
SQL

confirm() { # $1 request key, $2 output file, $3 seconds to hold the transaction open
  cat <<SQL
begin;
set local role authenticated;
\o /dev/null
select set_config('request.jwt.claims','{"sub":"81000000-0000-0000-0000-000000000001"}',true);
\o $2
select public.record_actual_allocation('$1', '{"contract_id":"81000000-0000-0000-0000-000000000003","work_area_id":"81000000-0000-0000-0000-000000000004","stage":"installation","reason":"Unplanned emergency repair","operative_ids":["81000000-0000-0000-0000-000000000005"]}');
\o $race_directory/ready-$(basename "$2")
select 'ready';
\o /dev/null
select pg_sleep($3);
commit;
SQL
}

wait_ready() {
  for ((attempt=0; attempt<100; attempt++)); do
    [[ -s "$race_directory/ready-$1" ]] && return 0
    kill -0 "$2" 2>/dev/null || return 1
    sleep 0.05
  done
  return 1
}

# Round 1: identical retries.
confirm 81000000-0000-0000-0000-0000000000a1 "$race_directory/first" 1 | "${psql[@]}" >"$race_directory/first.log" 2>&1 &
first_pid=$!
wait_ready first "$first_pid" || { cat "$race_directory/first.log" >&2; echo 'FAIL: first confirmation did not reach the transaction boundary.' >&2; exit 1; }
confirm 81000000-0000-0000-0000-0000000000a1 "$race_directory/retry" 0 | "${psql[@]}" >"$race_directory/retry.log" 2>&1 &
retry_pid=$!
failed=0
wait "$first_pid" || failed=1
wait "$retry_pid" || failed=1
if (( failed )); then cat "$race_directory/first.log" "$race_directory/retry.log" >&2; exit 1; fi
if [[ -z "$(cat "$race_directory/first")" || "$(cat "$race_directory/first")" != "$(cat "$race_directory/retry")" ]]; then
  echo 'FAIL: concurrent retries of one confirmation returned different allocations.' >&2
  exit 1
fi

# Round 2: a duplicate under a new key while the original is uncommitted.
"${psql[@]}" <<'SQL' >/dev/null
-- End round 1's open allocation so round 2 starts from a free operative.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-0000-0000-000000000001"}',true);
select public.void_actual_allocation(id, 'Round one fixture cleared for the duplicate-key race')
from public.actual_allocations where contract_id = '81000000-0000-0000-0000-000000000003';
commit;
SQL
confirm 81000000-0000-0000-0000-0000000000b1 "$race_directory/original" 1 | "${psql[@]}" >"$race_directory/original.log" 2>&1 &
original_pid=$!
wait_ready original "$original_pid" || { cat "$race_directory/original.log" >&2; echo 'FAIL: original confirmation did not reach the transaction boundary.' >&2; exit 1; }
set +e
confirm 81000000-0000-0000-0000-0000000000b2 "$race_directory/duplicate" 0 | "${psql[@]}" >"$race_directory/duplicate.log" 2>&1
duplicate_status=$?
set -e
wait "$original_pid" || { cat "$race_directory/original.log" >&2; exit 1; }
if (( duplicate_status == 0 )) || ! grep -q 'already recorded at Flat 52' "$race_directory/duplicate.log"; then
  cat "$race_directory/duplicate.log" >&2
  echo 'FAIL: a concurrent duplicate under a different key was not refused.' >&2
  exit 1
fi

"${psql[@]}" <<'SQL'
select test.assert((select count(*) = 1 from public.actual_allocations where contract_id = '81000000-0000-0000-0000-000000000003' and voided_at is not null),
  'concurrent same-key retries committed exactly one allocation');
select test.assert((select count(*) = 1 from public.actual_allocations where contract_id = '81000000-0000-0000-0000-000000000003' and voided_at is null),
  'a concurrent duplicate under a different key waited for the original and was refused');
select test.assert((select count(*) = 1 from public.actual_allocation_operatives ao join public.actual_allocations a on a.id = ao.actual_allocation_id
  where a.contract_id = '81000000-0000-0000-0000-000000000003' and a.voided_at is null),
  'the operative is recorded in exactly one place');
SQL
