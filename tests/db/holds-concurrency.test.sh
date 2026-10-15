#!/usr/bin/env bash
# Independent authenticated transactions exercise exact retries, stale writes
# and release versus a simultaneous overlapping stop in the disposable DB.
set -euo pipefail
psql_binary="$1"
test_socket="$2"
test_port="$3"
race_directory="$(mktemp -d "$test_socket/hold-race.XXXXXXXX")"
psql=("$psql_binary" -X -q -A -t -w -h "$test_socket" -p "$test_port" -U postgres -d postgres -v ON_ERROR_STOP=1)
owner=cf100000-0000-4000-8000-000000000001
supervisor=cf100000-0000-4000-8000-000000000002
reviewer=cf100000-0000-4000-8000-000000000003
"${psql[@]}" >/dev/null <<'SQL'
begin;
insert into auth.users(id,email) values
 ('cf100000-0000-4000-8000-000000000001','hold-race-owner@example.invalid'),
 ('cf100000-0000-4000-8000-000000000002','hold-race-supervisor@example.invalid'),
 ('cf100000-0000-4000-8000-000000000003','hold-race-reviewer@example.invalid');
insert into public.organisations(id,name) values('cf200000-0000-4000-8000-000000000001','Concurrent hold contractor');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access) values
 ('cf200000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000001','Concurrent hold owner','owner',true),
 ('cf200000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000002','Concurrent correcting supervisor','supervisor',false),
 ('cf200000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000003','Independent concurrent reviewer','contracts_manager',false);
insert into public.contracts(id,organisation_id,reference,name,created_by)
 values('cf300000-0000-4000-8000-000000000001','cf200000-0000-4000-8000-000000000001','HOLD-RACE','Concurrent hold site','cf100000-0000-4000-8000-000000000001');
insert into public.contract_assignments(contract_id,organisation_id,user_id) values
 ('cf300000-0000-4000-8000-000000000001','cf200000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000002'),
 ('cf300000-0000-4000-8000-000000000001','cf200000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000003');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000001"}',true);
select public.create_locations('cf300000-0000-4000-8000-000000000001',gen_random_uuid(),null,'[{"name":"Concurrent Hold Bathroom"}]');
select public.create_operative(gen_random_uuid(),'{"display_name":"Concurrent repair operative","engagement":"direct_employee"}');
insert into public.document_revisions(id,organisation_id,contract_id,document_reference,revision,title,classification,object_path,sha256,mime_type,bytes)
 values('cf500000-0000-4000-8000-000000000001','cf200000-0000-4000-8000-000000000001','cf300000-0000-4000-8000-000000000001',
 'RACE-SPEC',1,'Approved race specification','operational','cf200000-0000-4000-8000-000000000001/cf300000-0000-4000-8000-000000000001/operational/contract/cf500000-0000-4000-8000-000000000001.pdf',repeat('d',64),'application/pdf',8);
reset role;
insert into storage.objects(bucket_id,name,owner,metadata)
 select 'tilespec-evidence',object_path,created_by,jsonb_build_object('size',bytes,'mimetype',mime_type) from public.document_revisions where id='cf500000-0000-4000-8000-000000000001';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.complete_document_upload('cf500000-0000-4000-8000-000000000001','cf100000-0000-4000-8000-000000000001',repeat('d',64));
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000001"}',true);
select public.configure_inspection_requirement(gen_random_uuid(),jsonb_build_object('contract_id','cf300000-0000-4000-8000-000000000001',
 'work_area_id',(select id from public.work_areas where name='Concurrent Hold Bathroom'),'stage','installation','applicability','not_required',
 'approved_document_ids',jsonb_build_array('cf500000-0000-4000-8000-000000000001'),'basis','Approved specification confirms no additional mandatory check for this activity'));
commit;
SQL
area="$("${psql[@]}" -c "select id from public.work_areas where name='Concurrent Hold Bathroom'")"
person="$("${psql[@]}" -c "select id from public.operatives where display_name='Concurrent repair operative'")"
hold_data="{\"contract_id\":\"cf300000-0000-4000-8000-000000000001\",\"work_area_id\":\"$area\",\"stage\":\"installation\",\"hold_type\":\"quality\",\"category\":\"Wrong installation material\",\"severity\":\"major\",\"reason\":\"Concurrent original quality finding\",\"required_action\":\"Replace material and record corrected installation\",\"document_ids\":[\"cf500000-0000-4000-8000-000000000001\"]}"

race() {
 local first_sql="$1" second_sql="$2" expectation="$3" first_actor="$4" second_actor="$5"
 rm -f "$race_directory/ready" "$race_directory/first-result" "$race_directory/second-result"
 "${psql[@]}" >"$race_directory/first.log" 2>&1 <<SQL &
begin;
set local role authenticated;
\o /dev/null
select set_config('request.jwt.claims','{"sub":"$first_actor"}',true);
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
  echo 'FAIL: first hold request did not reach its transaction boundary.' >&2
  exit 1
 fi
 "${psql[@]}" >"$race_directory/second.log" 2>&1 <<SQL &
begin;
set local role authenticated;
\o /dev/null
select set_config('request.jwt.claims','{"sub":"$second_actor"}',true);
\o $race_directory/second-result
$second_sql
\o /dev/null
commit;
SQL
 second_pid=$!
 wait "$first_pid" || failed=1
 wait "$second_pid" || failed=1
 if ((failed)); then cat "$race_directory/first.log" "$race_directory/second.log" >&2; exit 1; fi
 if [[ "$expectation" == identical ]]; then
  [[ -s "$race_directory/first-result" && "$(cat "$race_directory/first-result")" == "$(cat "$race_directory/second-result")" ]] || {
   echo 'FAIL: concurrent hold retries returned different result IDs.' >&2; exit 1;
  }
 elif [[ "$expectation" == stale ]]; then
  grep -E 'ok - ' "$race_directory/second.log"
 else
  [[ -s "$race_directory/first-result" && -s "$race_directory/second-result" ]] || {
   echo 'FAIL: concurrent independent hold actions did not return saved results.' >&2; exit 1;
  }
 fi
}
create_sql="select public.create_work_hold('cf400000-0000-4000-8000-000000000001','$hold_data');"
race "$create_sql" "$create_sql" identical "$owner" "$owner"
hold="$(cat "$race_directory/first-result")"
"${psql[@]}" >/dev/null <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"$owner"}',true);
select public.transition_work_hold('$hold',gen_random_uuid(),1,'assign',jsonb_build_object('note','Assign the repair without approving any future release',
 'operative_id','$person','required_action','Replace material according to approved specification','target_date',private.site_today()::text));
commit;
SQL
reserve_sql="select public.reserve_hold_photo('$hold','cf400000-0000-4000-8000-000000000002','correction',jsonb_build_object('mime_type','image/png','sha256',repeat('a',64),'bytes',8));"
race "$reserve_sql" "$reserve_sql" identical "$supervisor" "$supervisor"
photo="$(cat "$race_directory/first-result")"
"${psql[@]}" >/dev/null <<SQL
begin;
insert into storage.objects(bucket_id,name,owner,metadata)
 select 'supervisor-evidence',object_path,actor_id,jsonb_build_object('size',bytes,'mimetype',mime_type) from public.hold_photos where id='$photo';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.complete_hold_photo('$photo','$supervisor',repeat('a',64));
commit;
SQL
# A fixed payload simulates retrying the exact request after losing a reply.
completed_at="$("${psql[@]}" -c "select to_jsonb(clock_timestamp()) #>> '{}'")"
correction_sql="select public.transition_work_hold('$hold','cf400000-0000-4000-8000-000000000003',2,'submit_correction',jsonb_build_object('note','Verified concurrent correction ready for review','photo_ids',jsonb_build_array('$photo'),'document_ids','[]'::jsonb,'completed_at','$completed_at'));"
race "$correction_sql" "$correction_sql" identical "$supervisor" "$supervisor"
first_decision="select public.transition_work_hold('$hold','cf400000-0000-4000-8000-000000000004',3,'request_release','{\"note\":\"Independent authorisation requested after verified correction\"}');"
second_decision="select test.expect_error(\$query\$select public.transition_work_hold('$hold','cf400000-0000-4000-8000-000000000005',3,'escalate','{\"note\":\"A concurrent conflicting hold decision\"}')\$query\$,array['40001'],'concurrent hold decisions reject a stale second write');"
race "$first_decision" "$second_decision" stale "$supervisor" "$supervisor"
release_sql="select public.transition_work_hold('$hold','cf400000-0000-4000-8000-000000000006',4,'release','{\"note\":\"Independent reviewer confirmed saved correction and specification requirements\"}');"
stop_sql="select public.create_work_hold('cf400000-0000-4000-8000-000000000007',jsonb_build_object('contract_id','cf300000-0000-4000-8000-000000000001','work_area_id','$area',
 'stage','installation','hold_type','safety','category','Unsafe access','severity','critical','reason','A separate overlapping immediate access hazard','required_action','Isolate access and obtain designated authority acknowledgement',
 'document_ids','[]'::jsonb,'evidence_explanation','Photograph cannot be safely obtained until the hazard is isolated'));"
race "$release_sql" "$stop_sql" independent "$reviewer" "$owner"
overlap="$(cat "$race_directory/second-result")"
"${psql[@]}" <<SQL
select test.assert((select count(*)=1 from public.work_holds where id='$hold'),'concurrent exact stop retries commit one formal restriction');
select test.assert((select count(*)=1 from public.hold_photos where hold_id='$hold'),'concurrent hold photo reservations commit one immutable path');
select test.assert((select count(*)=1 from public.work_hold_events where hold_id='$hold' and action='submit_correction'),'concurrent lost-response correction retries commit one permanent correction event');
select test.assert((select count(*)=1 from public.work_hold_events where hold_id='$hold' and action='request_release')
 and not exists(select 1 from public.work_hold_events where hold_id='$hold' and action='escalate'),'stale concurrent decision cannot overwrite the saved release request');
select test.assert((select status='released' and version=5 from public.work_holds where id='$hold')
 and (select status='active' and hold_type='safety' from public.work_holds where id='$overlap'),'releasing one hold and concurrently raising another preserve both independent saved decisions');
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"$owner"}',true);
select test.assert(public.work_release_status('cf300000-0000-4000-8000-000000000001','$area','installation',null)->>'status'='stopped_safety'
 and not (public.work_release_status('cf300000-0000-4000-8000-000000000001','$area','installation',null)->>'authorised')::boolean,
 'a concurrent overlapping safety stop prevents the work from being represented as authorised after another hold was released');
rollback;
select test.assert((select count(*)=1 from public.work_hold_events where hold_id='$hold' and action='release')
 and (select count(*)=1 from public.work_hold_events where hold_id='$overlap' and action='raise'),'release versus overlapping stop keeps exactly one permanent event per action');
SQL
