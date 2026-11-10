#!/usr/bin/env bash
# Two supervisors verify two invoices for the same gang and location at the same moment.
# Only 30 m² is measured and passed, and each invoice claims 30 m². The ledger lock must let
# exactly one verification through: the same work can never be verified (and paid) twice.
set -euo pipefail
psql_binary="$1"
test_socket="$2"
test_port="$3"
race_directory="$(mktemp -d "$test_socket/gang-race.XXXXXXXX")"
psql=("$psql_binary" -X -q -A -t -w -h "$test_socket" -p "$test_port" -U postgres -d postgres -v ON_ERROR_STOP=1)

"${psql[@]}" >"$race_directory/setup.log" 2>&1 <<'SQL'
begin;
insert into auth.users(id,email) values
 ('a7000000-0000-4000-8000-000000000001','gang-race-owner@example.invalid'),
 ('a7000000-0000-4000-8000-000000000002','gang-race-sam@example.invalid'),
 ('a7000000-0000-4000-8000-000000000003','gang-race-sue@example.invalid'),
 ('a7000000-0000-4000-8000-000000000004','gang-race-dave@example.invalid');
insert into public.organisations(id,name) values ('a7100000-0000-4000-8000-000000000001','Gang race fixture');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access) values
 ('a7100000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001','Race owner','owner',true),
 ('a7100000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000002','Race Sam','supervisor',false),
 ('a7100000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000003','Race Sue','supervisor',false),
 ('a7100000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000004','Race Dave','subcontract_installer',false);
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 ('a7200000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000001','RACE-1','Race site','a7000000-0000-4000-8000-000000000001');
insert into public.work_areas(id,organisation_id,contract_id,name,created_by) values
 ('a7300000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000001','a7200000-0000-4000-8000-000000000001','Shop floor','a7000000-0000-4000-8000-000000000001');
insert into public.contract_assignments(organisation_id,contract_id,user_id) values
 ('a7100000-0000-4000-8000-000000000001','a7200000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000002'),
 ('a7100000-0000-4000-8000-000000000001','a7200000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000003');
insert into public.teams(id,organisation_id,name,kind) values ('a7400000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000001','Race gang','subcontract_gang');
insert into public.operatives(id,organisation_id,display_name,engagement,user_id) values
 ('a7500000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000001','Race Dave','subcontractor','a7000000-0000-4000-8000-000000000004');
insert into public.team_memberships(organisation_id,team_id,operative_id,is_lead,valid_from) values
 ('a7100000-0000-4000-8000-000000000001','a7400000-0000-4000-8000-000000000001','a7500000-0000-4000-8000-000000000001',true,current_date-7);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a7000000-0000-4000-8000-000000000001"}',true);
select public.save_gang_subcontract('{"contract_id":"a7200000-0000-4000-8000-000000000001","team_id":"a7400000-0000-4000-8000-000000000001"}');
select set_config('request.jwt.claims','{"sub":"a7000000-0000-4000-8000-000000000002"}',true);
select public.record_gang_measurement(gen_random_uuid(),'{"contract_id":"a7200000-0000-4000-8000-000000000001","team_id":"a7400000-0000-4000-8000-000000000001","work_area_id":"a7300000-0000-4000-8000-000000000001","quantity":30,"quality_status":"passed"}');
select set_config('request.jwt.claims','{"sub":"a7000000-0000-4000-8000-000000000004"}',true);
select public.submit_gang_invoice('a7600000-0000-4000-8000-000000000001',jsonb_build_object('contract_id','a7200000-0000-4000-8000-000000000001','team_id','a7400000-0000-4000-8000-000000000001',
 'lines',jsonb_build_array(jsonb_build_object('work_area_id','a7300000-0000-4000-8000-000000000001','quantity',30)),'file',jsonb_build_object('mime_type','application/pdf','bytes',10,'sha256',repeat('1',64))));
select public.submit_gang_invoice('a7600000-0000-4000-8000-000000000002',jsonb_build_object('contract_id','a7200000-0000-4000-8000-000000000001','team_id','a7400000-0000-4000-8000-000000000001',
 'lines',jsonb_build_array(jsonb_build_object('work_area_id','a7300000-0000-4000-8000-000000000001','quantity',30)),'file',jsonb_build_object('mime_type','application/pdf','bytes',10,'sha256',repeat('2',64))));
insert into storage.objects(bucket_id,name,metadata) select 'gang-claims',f.object_path,'{"size":10,"mimetype":"application/pdf"}'
  from public.gang_invoice_files f join public.gang_invoices i on i.id=f.invoice_id where i.contract_id='a7200000-0000-4000-8000-000000000001';
select public.complete_gang_file(f.id) from public.gang_invoice_files f join public.gang_invoices i on i.id=f.invoice_id where i.contract_id='a7200000-0000-4000-8000-000000000001';
commit;
SQL

verify() { # $1 supervisor, $2 invoice request key, $3 output name, $4 sleep before commit
  cat <<SQL
begin;
set local role authenticated;
\o /dev/null
select set_config('request.jwt.claims','{"sub":"$1"}',true);
\o $race_directory/$3-result
select public.verify_gang_invoice(gen_random_uuid(),i.id,2,jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('line_id',l.id,'verified_quantity',30))))
  from public.gang_invoices i join public.gang_invoice_lines l on l.invoice_id=i.id where i.request_key='$2';
\o $race_directory/$3-ready
select 'ready';
\o /dev/null
select pg_sleep($4);
commit;
SQL
}
verify a7000000-0000-4000-8000-000000000002 a7600000-0000-4000-8000-000000000001 first 1 | "${psql[@]}" >"$race_directory/first.log" 2>&1 &
first_pid=$!
ready=false
for ((attempt=0; attempt<100; attempt++)); do
  if [[ -s "$race_directory/first-ready" ]]; then ready=true; break; fi
  if ! kill -0 "$first_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
if [[ "$ready" != true ]]; then
  cat "$race_directory/setup.log" "$race_directory/first.log" >&2
  echo 'FAIL: the first verification did not reach its transaction boundary.' >&2
  exit 1
fi
verify a7000000-0000-4000-8000-000000000003 a7600000-0000-4000-8000-000000000002 second 0 | "${psql[@]}" >"$race_directory/second.log" 2>&1 &
second_pid=$!
first_status=0; second_status=0
wait "$first_pid" || first_status=$?
wait "$second_pid" || second_status=$?
if (( first_status != 0 )); then cat "$race_directory/first.log" >&2; echo 'FAIL: the first verification should succeed.' >&2; exit 1; fi
if (( second_status == 0 )) || ! grep -q 'measured, passed and not already paid or verified' "$race_directory/second.log"; then
  cat "$race_directory/second.log" >&2
  echo 'FAIL: the concurrent second verification of the same 30 m² should be refused.' >&2
  exit 1
fi
verified="$("${psql[@]}" -c "select count(*) from public.gang_invoices where contract_id='a7200000-0000-4000-8000-000000000001' and status='with_office'")"
waiting="$("${psql[@]}" -c "select count(*) from public.gang_verification_requests where contract_id='a7200000-0000-4000-8000-000000000001' and resolved_at is null")"
if [[ "$verified" != 1 || "$waiting" != 1 ]]; then
  echo "FAIL: expected one verified invoice and one still waiting, found $verified verified and $waiting waiting." >&2
  exit 1
fi
echo 'NOTICE:  ok - concurrent verifications cannot verify the same measured work twice'
