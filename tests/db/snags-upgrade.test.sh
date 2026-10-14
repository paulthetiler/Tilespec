#!/usr/bin/env bash
# The Phase 3B migration runs over populated Phase 3A history, never a hosted DB.
# Compare every original column, including private request keys and audit rows.
set -euo pipefail
psql_binary="$1"
test_socket="$2"
test_port="$3"
repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
base=("$psql_binary" -X -q -A -t -w -h "$test_socket" -p "$test_port" -U postgres -v ON_ERROR_STOP=1)
"${base[@]}" -d postgres -c 'create database snags_upgrade' >/dev/null
trap '"${base[@]}" -d postgres -c "drop database if exists snags_upgrade" >/dev/null 2>&1 || true' EXIT
psql=("${base[@]}" -d snags_upgrade)
grep -Ev '^create role' "$repository_root/tests/db/platform.sql" | "${psql[@]}" >/dev/null
migration_file="$repository_root/supabase/migrations/20261014160000_snag_lifecycle.sql"
for migration in "$repository_root"/supabase/migrations/*.sql; do
  [[ "$(basename "$migration")" < 20261014140000 ]] && "${psql[@]}" -f "$migration" >/dev/null
done
if "${psql[@]}" -f "$migration_file" >"$test_socket/snags-order.log" 2>&1 || ! grep -Eq 'Preflight failed' "$test_socket/snags-order.log"; then
  cat "$test_socket/snags-order.log" >&2
  echo 'FAIL: Phase 3B must refuse to apply before Phase 3A.' >&2
  exit 1
fi
"${psql[@]}" -f "$repository_root/supabase/migrations/20261014140000_location_inspections.sql" >/dev/null

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
commit;
-- Snapshot metadata is outside every application/platform schema under test.
create table test.original_tables as
 select n.nspname as schema_name,c.relname as table_name,array_agg(a.attname::text order by a.attnum) as original_columns,
  c.relrowsecurity,c.relforcerowsecurity
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
 where n.nspname in ('public','private','auth','storage') and c.relkind='r'
 group by n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity;
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
  # Phase 3B intentionally narrows issue/event/evidence policies and the event
  # snapshot column grant. Every unrelated policy/grant must remain identical.
  "${psql[@]}" <<'SQL'
select p::text from pg_policies p where schemaname in ('public','private','auth','storage')
 and tablename not in ('supervisor_issues','supervisor_issue_events','supervisor_issue_photos','objects') order by p::text;
select n.nspname||'.'||c.relname||':'||coalesce(c.relacl::text,'') from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join test.original_tables t on t.schema_name=n.nspname and t.table_name=c.relname
 where c.relname<>'supervisor_issue_events' order by n.nspname,c.relname;
select n.nspname||'.'||c.relname||':'||c.relrowsecurity||':'||c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join test.original_tables t on t.schema_name=n.nspname and t.table_name=c.relname order by n.nspname,c.relname;
SQL
}
legacy_view() {
  "${psql[@]}" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000002"}',true) is not null;
select id from public.supervisor_issues order by id;
select id,issue_id,actor_id,action,note,created_at from public.supervisor_issue_events order by id;
select id,object_path from public.supervisor_issue_photos order by id;
select name from storage.objects order by name;
select id from public.location_inspections order by id;
select id from public.actual_allocations order by id;
rollback;
SQL
}
preflight() {
  printf 'begin transaction read only;\n\\i %s\nrollback;\n' "$repository_root/supabase/inspection/snags-preflight.sql" | "${psql[@]}" -F '|'
}
before="$(snapshot)"
security_before="$(security_snapshot)"
view_before="$(legacy_view)"
report_before="$(preflight)"
if grep -Eq 'MISSING|ALREADY EXISTS|UNSAFE' <<<"$report_before"; then
  echo "$report_before" >&2
  exit 1
fi
collision_count="$(grep -Ec '^name collision\|' <<<"$report_before")"
[[ "$before" == "$(snapshot)" ]] || { echo 'FAIL: preflight modified history.' >&2; exit 1; }
if printf 'set role authenticated;\n\\i %s\n' "$migration_file" | "${psql[@]}" >"$test_socket/snags-limited.log" 2>&1 ||
 ! grep -Eq 'cannot read storage.objects past row-level security' "$test_socket/snags-limited.log" || [[ "$before" != "$(snapshot)" ]]; then
  cat "$test_socket/snags-limited.log" >&2
  echo 'FAIL: Phase 3B must refuse an applying role that cannot inspect stored bytes past RLS.' >&2
  exit 1
fi
# Deliberately drift only this disposable DB's bucket configuration. The
# read-only report and actual migration must reject each unsafe configuration;
# no new column/function may survive the refused transaction.
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
  if ! grep -Eq '^security\|evidence bucket is private and supports photographs\|UNSAFE' <<<"$unsafe_report"; then
    echo "$unsafe_report" >&2
    echo "FAIL: preflight failed to identify unsafe evidence bucket ($unsafe_case)." >&2
    exit 1
  fi
  if "${psql[@]}" -f "$migration_file" >"$test_socket/snags-bucket-$unsafe_case.log" 2>&1 ||
   ! grep -Eq 'Preflight failed: supervisor-evidence must be private and support JPEG/PNG photographs up to 4 MB' "$test_socket/snags-bucket-$unsafe_case.log" ||
   [[ "$unsafe_before" != "$(snapshot)" || "$unsafe_report" != "$(preflight)" ]]; then
    cat "$test_socket/snags-bucket-$unsafe_case.log" >&2
    echo "FAIL: unsafe evidence bucket ($unsafe_case) was not refused before changing history or schema." >&2
    exit 1
  fi
  "${psql[@]}" -c "update storage.buckets b set public=s.public,file_size_limit=s.file_size_limit,allowed_mime_types=s.allowed_mime_types,updated_at=s.updated_at from test.original_bucket_settings s where b.id=s.id;" >/dev/null
  [[ "$before" == "$(snapshot)" && "$report_before" == "$(preflight)" ]] || {
    echo 'FAIL: restoring the isolated evidence bucket did not preserve the original database.' >&2
    exit 1
  }
done
"${psql[@]}" -f "$migration_file" >/dev/null
after="$(snapshot)"
if [[ "$before" != "$after" || "$security_before" != "$(security_snapshot)" || "$view_before" != "$(legacy_view)" ]]; then
  diff <(echo "$before") <(echo "$after") >&2 || true
  echo 'FAIL: Phase 3B changed original records, unrelated security or staff legacy visibility.' >&2
  exit 1
fi
report_after="$(preflight)"
if [[ "$(grep -Ec 'ALREADY EXISTS' <<<"$report_after")" != "$collision_count" ]] ||
 [[ "$(grep -E '^row count' <<<"$report_before")" != "$(grep -E '^row count' <<<"$report_after")" ]]; then
  diff <(echo "$report_before") <(echo "$report_after") >&2 || true
  echo 'FAIL: Phase 3B preflight did not report all new objects and identical row counts.' >&2
  exit 1
fi
if "${psql[@]}" -f "$migration_file" >"$test_socket/snags-reapply.log" 2>&1 || ! grep -Eq 'Preflight failed' "$test_socket/snags-reapply.log" || [[ "$after" != "$(snapshot)" ]]; then
  cat "$test_socket/snags-reapply.log" >&2
  echo 'FAIL: repeated Phase 3B migration was not safely refused.' >&2
  exit 1
fi
"${psql[@]}" <<'SQL'
select test.assert(true,'Phase 3B refuses to run before Phase 3A or to run a second time');
select test.assert(true,'Phase 3B refuses an applying role that cannot inspect stored evidence past RLS, changing no history');
select test.assert(true,'read-only preflight and migration reject a public evidence bucket before changing history or schema');
select test.assert(true,'read-only preflight and migration reject an evidence bucket with a size limit below 4 MB before changing history or schema');
select test.assert(true,'read-only preflight and migration reject an evidence bucket missing PNG support before changing history or schema');
select test.assert(true,'Phase 3B preserves every original column in all public/private/auth/storage tables, including populated inspections, issue history, workforce, evidence, audits and request keys');
select test.assert(true,'Phase 3B preserves all unrelated policies and grants, every RLS flag and existing staff legacy record visibility');
select test.assert(true,'read-only Phase 3B preflight reports every new object and unchanged historical row counts');
select test.assert(not exists(select 1 from public.supervisor_issues i where
 (select bool_or(to_jsonb(i)->a.attname <> 'null'::jsonb) from pg_attribute a
  where a.attrelid='public.supervisor_issues'::regclass and a.attnum>0 and not a.attisdropped
  and not (a.attname::text=any((select original_columns from test.original_tables where table_name='supervisor_issues')::text[])))),
 'legacy issues retain NULL in every newly added snag field rather than fabricated findings or liability');
select test.assert(not exists(select 1 from public.supervisor_issue_events e where
 (select bool_or(to_jsonb(e)->a.attname <> 'null'::jsonb) from pg_attribute a
  where a.attrelid='public.supervisor_issue_events'::regclass and a.attnum>0 and not a.attisdropped
  and not (a.attname::text=any((select original_columns from test.original_tables where table_name='supervisor_issue_events')::text[])))),
 'legacy events retain NULL in every newly added lifecycle field');
select test.assert(not exists(select 1 from public.supervisor_issue_photos p where
 (select bool_or(to_jsonb(p)->a.attname <> 'null'::jsonb) from pg_attribute a
  where a.attrelid='public.supervisor_issue_photos'::regclass and a.attnum>0 and not a.attisdropped
  and not (a.attname::text=any((select original_columns from test.original_tables where table_name='supervisor_issue_photos')::text[])))),
 'legacy photographs retain NULL in every newly added verification field');
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ab100000-0000-4000-8000-000000000003"}',true);
select test.assert((select count(*)=0 from public.supervisor_issues) and (select count(*)=0 from public.actual_allocations),
 'the upgrade does not widen installer access to legacy issues or actual workforce history');
select test.expect_error('select snapshot from public.supervisor_issue_events',array['42501'],
 'protected workforce event snapshots have no direct authenticated SELECT grant');
rollback;
SQL
