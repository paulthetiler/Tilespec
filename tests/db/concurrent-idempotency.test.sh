#!/usr/bin/env bash
# The runner passes its private local socket explicitly. Two authenticated
# connections submit the same real RPC while the first transaction is uncommitted.
set -euo pipefail
psql_binary="$1"
test_socket="$2"
test_port="$3"
race_directory="$(mktemp -d "$test_socket/race.XXXXXXXX")"
psql=("$psql_binary" -X -q -A -t -w -h "$test_socket" -p "$test_port" -U postgres -d postgres -v ON_ERROR_STOP=1)
"${psql[@]}" <<'SQL'
begin;
insert into auth.users(id,email) values ('80000000-0000-0000-0000-000000000001','concurrent-owner@example.invalid');
insert into public.organisations(id,name) values ('80000000-0000-0000-0000-000000000002','Concurrent acceptance fixture');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access)
values ('80000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000001','Concurrent owner','owner',true);
commit;
SQL

"${psql[@]}" >"$race_directory/first.log" 2>&1 <<SQL &
begin;
set local role authenticated;
\o /dev/null
select set_config('request.jwt.claims','{"sub":"80000000-0000-0000-0000-000000000001"}',true);
\o $race_directory/first-result
select public.create_contract('80000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000003','{"reference":"TS-CONCURRENT","name":"Shopping centre flooring concurrent retry"}');
\o $race_directory/ready
select 'ready';
\o /dev/null
select pg_sleep(1);
commit;
SQL
first_pid=$!

# Wait at most five seconds for the first RPC to hold its transaction lock.
ready=false
for ((attempt=0; attempt<100; attempt++)); do
  if [[ -s "$race_directory/ready" ]]; then ready=true; break; fi
  if ! kill -0 "$first_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
if [[ "$ready" != true ]]; then
  cat "$race_directory/first.log" >&2
  wait "$first_pid" || true
  echo 'FAIL: first concurrent request did not reach the transaction boundary.' >&2
  exit 1
fi

"${psql[@]}" >"$race_directory/second.log" 2>&1 <<SQL &
begin;
set local role authenticated;
\o /dev/null
select set_config('request.jwt.claims','{"sub":"80000000-0000-0000-0000-000000000001"}',true);
\o $race_directory/second-result
select public.create_contract('80000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000003','{"reference":"TS-CONCURRENT","name":"Shopping centre flooring concurrent retry"}');
\o /dev/null
commit;
SQL
second_pid=$!
failed=0
wait "$first_pid" || failed=1
wait "$second_pid" || failed=1
if (( failed )); then
  cat "$race_directory/first.log" "$race_directory/second.log" >&2
  exit 1
fi
first_result="$(cat "$race_directory/first-result")"
second_result="$(cat "$race_directory/second-result")"
if [[ -z "$first_result" || "$first_result" != "$second_result" ]]; then
  echo 'FAIL: concurrent authenticated retries returned different record IDs.' >&2
  exit 1
fi

"${psql[@]}" <<'SQL'
select test.assert((select count(*) = 1 from public.contracts where reference='TS-CONCURRENT'),
  'concurrent authenticated retries commit exactly one contract');
select test.assert((select count(*) = 1 from public.audit_events where entity_type='contracts'
  and entity_id=(select id::text from public.contracts where reference='TS-CONCURRENT')
  and action='insert' and actor_id='80000000-0000-0000-0000-000000000001'),
  'concurrent retries produce exactly one creation audit with genuine actor');
select test.assert((select count(*) = 1 from private.idempotency_keys
  where actor_id='80000000-0000-0000-0000-000000000001' and operation='create_contract'),
  'concurrent requests retain exactly one idempotency result');
SQL
