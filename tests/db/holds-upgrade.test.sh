#!/usr/bin/env bash
# Phase 3C must preserve every populated original value and security boundary.
# This script uses only a fresh local database created by scripts/test-db.sh.
set -euo pipefail
psql_binary="$1"
test_socket="$2"
test_port="$3"
repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
base=("$psql_binary" -X -q -A -t -w -h "$test_socket" -p "$test_port" -U postgres -v ON_ERROR_STOP=1)
"${base[@]}" -d postgres -c 'create database holds_upgrade' >/dev/null
trap '"${base[@]}" -d postgres -c "drop database if exists holds_upgrade" >/dev/null 2>&1 || true; "${base[@]}" -d postgres -c "drop database if exists holds_order" >/dev/null 2>&1 || true' EXIT
psql=("${base[@]}" -d holds_upgrade)
grep -Ev '^create role' "$repository_root/tests/db/platform.sql" | "${psql[@]}" >/dev/null
phase3c=()
for migration in "$repository_root"/supabase/migrations/*.sql; do
  if [[ "$(basename "$migration")" < 20261014160001 ]]; then
    "${psql[@]}" -f "$migration" >/dev/null
  else
    phase3c+=("$migration")
  fi
done
if (( ${#phase3c[@]} == 0 )); then
  echo 'FAIL: Phase 3C migrations must exist.' >&2
  exit 1
fi
"${psql[@]}" >/dev/null <<'SQL'
begin;
insert into auth.users(id,email) values
 ('ab100000-0000-4000-8000-000000000001','snag-up-owner@example.invalid'),
 ('ab100000-0000-4000-8000-000000000002','snag-up-supervisor@example.invalid'),
 ('ab100000-0000-4000-8000-000000000003','snag-up-installer@example.invalid');
insert into public.organisations(id,name) values ('ab200000-0000-4000-8000-000000000001','Snag upgrade contractor');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access) values
 ('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001','Upgrade office','owner',true),
 ('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','Upgrade supervisor','supervisor',false),
 ('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003','Upgrade installer','subcontract_installer',false);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000001"}',true);
select public.create_contract('ab200000-0000-4000-8000-000000000001',gen_random_uuid(),'{"reference":"SNAG-UP","name":"Populated site","client":"Main contractor"}',
 '{"contract_value":75000,"labour_budget":20000}');
select id as contract from public.contracts \gset
insert into public.contract_assignments(contract_id,organisation_id,user_id)
 values(:'contract','ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002');
select public.create_locations(:'contract',gen_random_uuid(),null,'[{"name":"Flat 52","children":[{"name":"Bathroom"}]}]');
select id as flat from public.work_areas where name='Flat 52' \gset
select id as bathroom from public.work_areas where name='Bathroom' \gset
select public.create_work_package(:'flat',gen_random_uuid(),'{"name":"Existing tiling package","quantity":10,"unit":"m2"}') as package \gset
insert into public.package_assignments(organisation_id,contract_id,work_package_id,user_id)
 values('ab200000-0000-4000-8000-000000000001',:'contract',:'package','ab100000-0000-4000-8000-000000000003');
select public.create_team(gen_random_uuid(),'{"name":"Historical gang","kind":"direct_team"}') as gang \gset
select public.create_operative(gen_random_uuid(),'{"display_name":"Historical operative","engagement":"direct_employee","user_id":"ab100000-0000-4000-8000-000000000003"}') as person \gset
select public.create_operative(gen_random_uuid(),'{"display_name":"Absent operative","engagement":"direct_employee"}') as absent \gset
select public.add_team_member(gen_random_uuid(),jsonb_build_object('team_id',:'gang','operative_id',:'person','valid_from',(private.site_today()-30)::text));
select public.add_team_member(gen_random_uuid(),jsonb_build_object('team_id',:'gang','operative_id',:'absent','valid_from',(private.site_today()-30)::text));
select public.plan_allocation(gen_random_uuid(),jsonb_build_object('contract_id',:'contract','work_area_id',:'bathroom','work_package_id',:'package',
 'team_id',:'gang','stage','installation','planned_start',(private.site_today()-1)::text,'planned_end',private.site_today()::text,
 'operative_ids',jsonb_build_array(:'person',:'absent'))) as plan \gset
select public.create_location_inspection_template(gen_random_uuid(),jsonb_build_object('contract_id',:'contract','work_area_id',:'bathroom',
 'stage','installation','title','Existing bathroom finish','specification_reference','UP-SPEC','specification_revision','C','wet_area',true,
 'checklist','[{"label":"Existing level check","wet_only":false}]'::jsonb)) as template \gset
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000002"}',true);
select public.record_actual_allocation(gen_random_uuid(),jsonb_build_object('contract_id',:'contract','planned_allocation_id',:'plan',
 'operative_ids',jsonb_build_array(:'person'),'reason','Absent operative was not on site',
 'started_at',to_jsonb(((private.site_today()-1)+time '08:00') at time zone 'Europe/London'))) as allocation \gset
select public.record_allocation_absence(gen_random_uuid(),jsonb_build_object('planned_allocation_id',:'plan','work_date',(private.site_today()-1)::text,
 'operative_id',:'absent','reason','Absent with notice'));
select public.end_actual_allocation(:'allocation',((private.site_today()-1)+time '16:00') at time zone 'Europe/London');
select public.record_location_inspection(gen_random_uuid(),jsonb_build_object('contract_id',:'contract','work_area_id',:'bathroom',
 'template_id',:'template','answers','[{"status":"issue","note":"An earlier inspection concern"}]'::jsonb,'allocation_ids',jsonb_build_array(:'allocation')));
insert into public.supervisor_inspections(organisation_id,contract_id,actor_id,request_key,answers,issues_count)
 values('ab200000-0000-4000-8000-000000000001',:'contract',auth.uid(),gen_random_uuid(),
  (select jsonb_agg(jsonb_build_object('item','Legacy check '||n,'status',case when n=1 then 'issue' else 'pass' end,
   'note',case when n=1 then 'Original legacy defect' else '' end)) from generate_series(1,10) n),1);
select id as legacy_issue from public.supervisor_issues \gset
insert into storage.objects(bucket_id,name,owner,metadata)
 values('supervisor-evidence','ab200000-0000-4000-8000-000000000001/'||:'legacy_issue'||'/existing.png',auth.uid(),'{"size":8,"mimetype":"image/png"}');
insert into public.supervisor_issue_photos(issue_id,organisation_id,actor_id,object_path)
 values(:'legacy_issue','ab200000-0000-4000-8000-000000000001',auth.uid(),'ab200000-0000-4000-8000-000000000001/'||:'legacy_issue'||'/existing.png');
select public.transition_supervisor_issue(:'legacy_issue','report_rectification','An earlier repair submission preserved for review');
select public.transition_supervisor_issue(:'legacy_issue','request_reinspection','An earlier repair awaiting independent inspection');
-- Populate a current Phase 3B snag, private verified evidence and permanent
-- lifecycle history in addition to the preserved pre-3B legacy issue.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000002"}',true);
select public.create_snag(gen_random_uuid(),jsonb_build_object('contract_id',:'contract','work_area_id',:'bathroom','work_package_id',:'package',
 'stage','installation','category','Legacy upgrade snag','severity','major','description','Photographed pre-3C workmanship concern',
 'required_rectification','Preserve the original recorded repair instructions')) as historical_snag \gset
select public.reserve_snag_photo(:'historical_snag',gen_random_uuid(),'original',jsonb_build_object('mime_type','image/png','sha256',repeat('c',64),'bytes',8)) as snag_photo \gset
reset role;
insert into storage.objects(bucket_id,name,owner,metadata)
 select 'supervisor-evidence',object_path,actor_id,jsonb_build_object('size',bytes,'mimetype',mime_type) from public.supervisor_issue_photos where id=:'snag_photo';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.complete_snag_photo(:'snag_photo','ab100000-0000-4000-8000-000000000002',repeat('c',64));
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000002"}',true);
select public.transition_snag(:'historical_snag',gen_random_uuid(),1,'submit',jsonb_build_object('note','Original pre-3C finding supported by verified evidence','photo_ids',jsonb_build_array(:'snag_photo')));
select public.transition_snag(:'historical_snag',gen_random_uuid(),2,'propose_responsibility',jsonb_build_object('note','The original workforce evidence remains a proposal','allocation_id',:'allocation'));
select public.transition_snag(:'historical_snag',gen_random_uuid(),3,'assign',jsonb_build_object('note','A pre-3C repair assignment must remain unchanged','team_id',:'gang','required_action','Correct the photographed installation defect','target_date',private.site_today()::text));
commit;
-- Snapshot metadata is outside every application/platform schema under test.
create table test.original_tables as
 select n.nspname as schema_name,c.relname as table_name,array_agg(a.attname::text order by a.attnum) as original_columns,
  c.relrowsecurity,c.relforcerowsecurity
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
 where n.nspname in ('public','private','auth','storage') and c.relkind='r'
 group by n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity;
create table test.original_policies as select schemaname,tablename,policyname from pg_policies
 where schemaname in ('public','private','auth','storage');
SQL

snapshot() {
  "${psql[@]}" <<'SQL'
select schema_name||'.'||table_name||':'||
 (xpath('/row/hash/text()',query_to_xml(format(
  'select md5(coalesce(string_agg(j::text,''|'' order by j::text),'''')) as hash from (select (select jsonb_object_agg(k,to_jsonb(x)->k) from unnest(%L::text[]) k) as j from %I.%I x) rows',
  original_columns,schema_name,table_name),false,true,'')))[1]::text
 from test.original_tables order by schema_name,table_name;
SQL
}
security_snapshot() {
  "${psql[@]}" <<'SQL'
select t.schemaname||'.'||t.tablename||'.'||t.policyname||':'||coalesce(p::text,'MISSING')
 from test.original_policies t left join pg_policies p
 on t.schemaname=p.schemaname and t.tablename=p.tablename and t.policyname=p.policyname
 order by t.schemaname,t.tablename,t.policyname;
select n.nspname||'.'||c.relname||':'||coalesce(c.relacl::text,'')||':'||c.relrowsecurity||':'||c.relforcerowsecurity
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join test.original_tables t on t.schema_name=n.nspname and t.table_name=c.relname
 order by n.nspname,c.relname;
select n.nspname||'.'||c.relname||'.'||a.attname||':'||coalesce(a.attacl::text,'')
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join test.original_tables t on t.schema_name=n.nspname and t.table_name=c.relname
 join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
 where a.attname::text=any(t.original_columns) order by n.nspname,c.relname,a.attnum;
SQL
}
legacy_view() {
 "${psql[@]}" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000002"}',true) is not null;
select id,description,snag_status,version from public.supervisor_issues order by id;
select id,issue_id,actor_id,action,note,created_at from public.supervisor_issue_events order by id;
select id,object_path,uploaded_at from public.supervisor_issue_photos order by id;
select name from storage.objects order by name;
select id,answers from public.location_inspections order by id;
select id,started_at,ended_at from public.actual_allocations order by id;
rollback;
SQL
}
before="$(snapshot)"
security_before="$(security_snapshot)"
view_before="$(legacy_view)"
# Applying in the wrong order must fail before creating any competing model.
"${base[@]}" -d postgres -c 'create database holds_order' >/dev/null
order_psql=("${base[@]}" -d holds_order)
grep -Ev '^create role' "$repository_root/tests/db/platform.sql" | "${order_psql[@]}" >/dev/null
for migration in "$repository_root"/supabase/migrations/*.sql; do
 [[ "$(basename "$migration")" < 20261014160000 ]] && "${order_psql[@]}" -f "$migration" >/dev/null
done
if "${order_psql[@]}" -f "${phase3c[0]}" >"$test_socket/holds-order.log" 2>&1 ||
 ! grep -Eq 'Preflight failed' "$test_socket/holds-order.log"; then
 cat "$test_socket/holds-order.log" >&2
 echo 'FAIL: mandatory requirements must refuse to run before Phase 3B.' >&2
 exit 1
fi
"${order_psql[@]}" -f "$repository_root/supabase/migrations/20261014160000_snag_lifecycle.sql" >/dev/null
if "${order_psql[@]}" -f "${phase3c[1]}" >"$test_socket/holds-order.log" 2>&1 ||
 ! grep -Eq 'Preflight failed' "$test_socket/holds-order.log"; then
 cat "$test_socket/holds-order.log" >&2
 echo 'FAIL: formal holds must refuse to run before mandatory requirements.' >&2
 exit 1
fi
"${base[@]}" -d postgres -c 'drop database holds_order' >/dev/null
preflight() {
 "${psql[@]}" -F '|' -f "$repository_root/supabase/inspection/holds-preflight.sql"
}
for migration in "${phase3c[@]}"; do
 if [[ "$(basename "$migration")" == 20261015091000_work_holds.sql ]]; then
  report_before="$(preflight)"
  [[ "$before" == "$(snapshot)" ]] || { echo 'FAIL: read-only hold preflight changed history.' >&2; exit 1; }
  if printf 'set role authenticated;\n\\i %s\n' "$migration" | "${psql[@]}" >"$test_socket/holds-limited.log" 2>&1 ||
   ! grep -Eq 'applying role must read Storage beyond RLS' "$test_socket/holds-limited.log" || [[ "$before" != "$(snapshot)" ]]; then
   cat "$test_socket/holds-limited.log" >&2
   echo 'FAIL: hold migration must refuse a role unable to inspect private stored evidence.' >&2
   exit 1
  fi
  "${psql[@]}" -c "create table test.original_bucket_settings as select id,public,file_size_limit,allowed_mime_types,updated_at from storage.buckets where id='supervisor-evidence';" >/dev/null
  for unsafe_case in public insufficient_size missing_png; do
   case "$unsafe_case" in
    public) unsafe_update="public=true" ;;
    insufficient_size) unsafe_update="file_size_limit=4194303" ;;
    missing_png) unsafe_update="allowed_mime_types=array['image/jpeg']" ;;
   esac
   "${psql[@]}" -c "update storage.buckets set $unsafe_update where id='supervisor-evidence';" >/dev/null
   unsafe_before="$(snapshot)"
   unsafe_report="$(preflight)"
   if ! grep -Eq '(^supervisor-evidence\|.*\|f$|"evidence_bucket_safe": false)' <<<"$unsafe_report"; then
    echo "$unsafe_report" >&2
    echo "FAIL: preflight failed to report an unsafe hold bucket ($unsafe_case)." >&2
    exit 1
   fi
   if "${psql[@]}" -f "$migration" >"$test_socket/holds-bucket-$unsafe_case.log" 2>&1 ||
    ! grep -Eq 'private JPEG/PNG evidence bucket required' "$test_socket/holds-bucket-$unsafe_case.log" || [[ "$unsafe_before" != "$(snapshot)" ]]; then
    cat "$test_socket/holds-bucket-$unsafe_case.log" >&2
    echo "FAIL: unsafe hold bucket ($unsafe_case) changed history/schema instead of refusing migration." >&2
    exit 1
   fi
   "${psql[@]}" -c "update storage.buckets b set public=s.public,file_size_limit=s.file_size_limit,allowed_mime_types=s.allowed_mime_types,updated_at=s.updated_at from test.original_bucket_settings s where b.id=s.id;" >/dev/null
   [[ "$before" == "$(snapshot)" && "$report_before" == "$(preflight)" ]] || {
    echo 'FAIL: restoring test bucket failed to preserve the historical database.' >&2; exit 1;
   }
  done
 fi
 "${psql[@]}" -f "$migration" >/dev/null
 if [[ "$before" != "$(snapshot)" ]]; then
  diff <(echo "$before") <(snapshot) >&2 || true
  echo "FAIL: $(basename "$migration") rewrote populated historical records." >&2
  exit 1
 fi
done
if [[ "$security_before" != "$(security_snapshot)" || "$view_before" != "$(legacy_view)" ]]; then
 diff <(echo "$security_before") <(security_snapshot) >&2 || true
 echo 'FAIL: Phase 3C altered original table policies/grants/RLS or staff historic visibility.' >&2
 exit 1
fi
for migration in "${phase3c[@]}"; do
 if "${psql[@]}" -f "$migration" >"$test_socket/holds-reapply.log" 2>&1 ||
  ! grep -Eq 'Preflight failed' "$test_socket/holds-reapply.log" || [[ "$before" != "$(snapshot)" ]]; then
  cat "$test_socket/holds-reapply.log" >&2
  echo "FAIL: repeated $(basename "$migration") was not safely refused." >&2
  exit 1
 fi
done
"${psql[@]}" <<'SQL'
select test.assert(true,'Phase 3C preserves every original column across populated public/private/auth/storage history, including legacy issues, inspected templates, workforce snapshots and verified snag photographs');
select test.assert(true,'Phase 3C preserves original table policies, grants, column grants, RLS flags and staff historical visibility');
select test.assert(true,'each repeated Phase 3C migration is safely refused without rewriting history');
select test.assert(true,'mandatory requirements refuse to run before Phase 3B, and holds refuse to run before mandatory requirements');
select test.assert(true,'the hold migration refuses an applying role unable to inspect stored evidence past RLS without changing history');
select test.assert(true,'read-only preflight and migration reject a public evidence bucket without changing history or schema');
select test.assert(true,'read-only preflight and migration reject evidence buckets below four megabytes or missing PNG support without changing history or schema');
select test.assert(true,'read-only hold preflight preserves every historical value and reports safely restored bucket configuration');

begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000003"}',true);
select test.assert((select count(*)=0 from public.supervisor_issues where snag_status is null) and (select count(*)=0 from public.actual_allocations),
 'Phase 3C does not widen installer access to legacy morning findings or actual workforce history');
select test.expect_error('select snapshot from public.supervisor_issue_events',array['42501'],
 'Phase 3C keeps immutable protected workforce snapshots unavailable through direct authenticated SELECT');
rollback;
SQL
