#!/usr/bin/env bash
# Real separate authenticated transactions, including lost responses and two
# decisions made from the same version. All access uses the runner's local DB.
set -euo pipefail
psql_binary="$1"
test_socket="$2"
test_port="$3"
race_directory="$(mktemp -d "$test_socket/snag-race.XXXXXXXX")"
psql=("$psql_binary" -X -q -A -t -w -h "$test_socket" -p "$test_port" -U postgres -d postgres -v ON_ERROR_STOP=1)
"${psql[@]}" >/dev/null <<'SQL'
begin;
insert into auth.users(id,email) values('ad100000-0000-4000-8000-000000000001','concurrent-snag@example.invalid');
insert into public.organisations(id,name) values('ad200000-0000-4000-8000-000000000001','Concurrent snag contractor');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access)
 values('ad200000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001','Concurrent snag owner','owner',true);
insert into public.contracts(id,organisation_id,reference,name,created_by)
 values('ad300000-0000-4000-8000-000000000001','ad200000-0000-4000-8000-000000000001','SNAG-RACE','Concurrent snag site','ad100000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ad100000-0000-4000-8000-000000000001"}',true);
select public.create_locations('ad300000-0000-4000-8000-000000000001',gen_random_uuid(),null,'[{"name":"Concurrency Bathroom"}]');
commit;
SQL
area="$("${psql[@]}" -c "select id from public.work_areas where name='Concurrency Bathroom'")"
snag_data="{\"contract_id\":\"ad300000-0000-4000-8000-000000000001\",\"work_area_id\":\"$area\",\"stage\":\"installation\",\"category\":\"Excessive lippage\",\"severity\":\"major\",\"description\":\"Concurrent photographed finding\",\"required_rectification\":\"Relay the affected tiles\"}"

race() {
  local first_sql="$1" second_sql="$2" expectation="$3"
  rm -f "$race_directory/ready" "$race_directory/first-result" "$race_directory/second-result"
  "${psql[@]}" >"$race_directory/first.log" 2>&1 <<SQL &
begin;
set local role authenticated;
\o /dev/null
select set_config('request.jwt.claims','{"sub":"ad100000-0000-4000-8000-000000000001"}',true);
\o $race_directory/first-result
$first_sql
\o $race_directory/ready
select 'ready';
\o /dev/null
select pg_sleep(1);
commit;
SQL
  local first_pid=$! second_pid failed=0 ready=false
  for ((attempt=0; attempt<100; attempt++)); do
    if [[ -s "$race_directory/ready" ]]; then ready=true; break; fi
    if ! kill -0 "$first_pid" 2>/dev/null; then break; fi
    sleep 0.05
  done
  if [[ "$ready" != true ]]; then
    cat "$race_directory/first.log" >&2
    wait "$first_pid" || true
    echo 'FAIL: first snag request did not reach its transaction boundary.' >&2
    exit 1
  fi
  "${psql[@]}" >"$race_directory/second.log" 2>&1 <<SQL &
begin;
set local role authenticated;
\o /dev/null
select set_config('request.jwt.claims','{"sub":"ad100000-0000-4000-8000-000000000001"}',true);
\o $race_directory/second-result
$second_sql
\o /dev/null
commit;
SQL
  second_pid=$!
  wait "$first_pid" || failed=1
  wait "$second_pid" || failed=1
  if (( failed )); then cat "$race_directory/first.log" "$race_directory/second.log" >&2; exit 1; fi
  if [[ "$expectation" == identical ]]; then
    [[ -s "$race_directory/first-result" && "$(cat "$race_directory/first-result")" == "$(cat "$race_directory/second-result")" ]] || {
      echo 'FAIL: concurrent snag retries returned different result IDs.' >&2; exit 1;
    }
  else
    grep -E 'ok - ' "$race_directory/second.log"
  fi
}

create_sql="select public.create_snag('ad400000-0000-4000-8000-000000000001','$snag_data');"
race "$create_sql" "$create_sql" identical
snag="$(cat "$race_directory/first-result")"
reserve_sql="select public.reserve_snag_photo('$snag','ad400000-0000-4000-8000-000000000002','original',jsonb_build_object('mime_type','image/png','sha256',repeat('a',64),'bytes',8));"
race "$reserve_sql" "$reserve_sql" identical
photo="$(cat "$race_directory/first-result")"
"${psql[@]}" >/dev/null <<SQL
begin;
insert into storage.objects(bucket_id,name,owner,metadata)
 select 'supervisor-evidence',object_path,actor_id,jsonb_build_object('size',bytes,'mimetype',mime_type) from public.supervisor_issue_photos where id='$photo';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.complete_snag_photo('$photo','ad100000-0000-4000-8000-000000000001',repeat('a',64));
commit;
SQL
submit_sql="select public.transition_snag('$snag','ad400000-0000-4000-8000-000000000003',1,'submit',jsonb_build_object('note','Submit the photographed finding','photo_ids',jsonb_build_array('$photo')));"
race "$submit_sql" "$submit_sql" identical
first_decision="select public.transition_snag('$snag','ad400000-0000-4000-8000-000000000004',2,'mark_unknown','{\"note\":\"Insufficient evidence to determine responsibility\"}');"
second_decision="select test.expect_error(\$query\$select public.transition_snag('$snag','ad400000-0000-4000-8000-000000000005',2,'escalate','{\"note\":\"A concurrent conflicting decision\"}')\$query\$,array['40001'],'concurrent decisions on the same snag version reject the stale second write');"
race "$first_decision" "$second_decision" stale
"${psql[@]}" <<SQL
select test.assert((select count(*)=1 from public.supervisor_issues where id='$snag'),'concurrent create retries commit one snag');
select test.assert((select count(*)=1 from public.supervisor_issue_photos where issue_id='$snag'),'concurrent photo reservations commit one upload path');
select test.assert((select count(*)=1 from public.supervisor_issue_events where issue_id='$snag' and action='submit'),'concurrent submission retries commit one lifecycle event');
select test.assert((select version=3 and responsibility_state='unable_to_determine' and not escalated from public.supervisor_issues where id='$snag'),'stale concurrent decision cannot overwrite the recorded result');
select test.assert((select count(*)=4 from private.idempotency_keys where actor_id='ad100000-0000-4000-8000-000000000001' and operation in ('create_snag','reserve_snag_photo','transition_snag')),
 'concurrent retries retain one result per successful request, and no result for the rejected stale write');
select test.assert((select count(*)=1 from public.audit_events where entity_type='supervisor_issues' and entity_id='$snag' and action='insert')
 and (select count(*)=3 from public.supervisor_issue_events where issue_id='$snag'),'concurrent lost-response retries preserve exactly one initial finding and each successful history event');
SQL
