#!/usr/bin/env bash
# Applies the Supervisor V2 migrations over a database that already holds
# operational records at the pre-V2 schema, and proves every existing row is
# preserved exactly. Uses a separate scratch database in the disposable cluster.
set -euo pipefail
psql_binary="$1"
test_socket="$2"
test_port="$3"
repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
first_v2_migration=20261014090000
base=("$psql_binary" -X -q -A -t -w -h "$test_socket" -p "$test_port" -U postgres -v ON_ERROR_STOP=1)
"${base[@]}" -d postgres -c 'create database upgrade_check' >/dev/null
trap '"${base[@]}" -d postgres -c "drop database if exists upgrade_check" >/dev/null 2>&1 || true' EXIT
psql=("${base[@]}" -d upgrade_check)

# Roles are cluster-wide and already exist; the rest of the platform surface is per database.
grep -v '^create role' "$repository_root/tests/db/platform.sql" | "${psql[@]}" >/dev/null
for migration in "$repository_root"/supabase/migrations/*.sql; do
  [[ "$(basename "$migration")" < "$first_v2_migration" ]] && "${psql[@]}" -f "$migration" >/dev/null
done

# Legacy records as they exist before V2, including data V2 would not itself allow.
"${psql[@]}" >/dev/null <<'SQL'
begin;
insert into auth.users(id, email) values
  ('82000000-0000-0000-0000-000000000001', 'legacy-owner@example.invalid'),
  ('82000000-0000-0000-0000-000000000002', 'legacy-supervisor@example.invalid'),
  ('82000000-0000-0000-0000-000000000003', 'legacy-installer@example.invalid');
insert into public.organisations(id, name) values ('82000000-0000-0000-0000-000000000010', 'Legacy operations company');
insert into public.organisation_members(organisation_id, user_id, display_name, role, financial_access) values
  ('82000000-0000-0000-0000-000000000010', '82000000-0000-0000-0000-000000000001', 'Owner', 'owner', true),
  ('82000000-0000-0000-0000-000000000010', '82000000-0000-0000-0000-000000000002', 'Supervisor', 'supervisor', false),
  ('82000000-0000-0000-0000-000000000010', '82000000-0000-0000-0000-000000000003', 'Installer', 'subcontract_installer', false);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"82000000-0000-0000-0000-000000000001"}', true);
select public.create_contract('82000000-0000-0000-0000-000000000010', '82000000-0000-0000-0000-000000000020',
  '{"reference":"LEG-001","name":"Legacy school corridors","client":"Main contractor","address":"Site","scope":"Corridors"}',
  '{"contract_value":50000,"labour_budget":12000,"materials_budget":15000,"preliminaries_budget":2000,"contingency":1500,"payment_terms":"Monthly","retention_percent":3}');
reset role;
-- Two legacy top-level areas share a name; V2 must not fail or rename them.
insert into public.work_areas(id, organisation_id, contract_id, name, location, substrate_notes, created_by, created_at)
select a.id::uuid, '82000000-0000-0000-0000-000000000010', c.id, a.name, a.location, 'Sand/cement screed', '82000000-0000-0000-0000-000000000001', now() - interval '3 days'
from public.contracts c, (values ('82000000-0000-0000-0000-000000000031', 'Corridor', 'Ground floor'),
  ('82000000-0000-0000-0000-000000000032', 'Corridor', 'First floor'), ('82000000-0000-0000-0000-000000000033', 'Hall', 'Main hall')) a(id, name, location);
insert into public.work_packages(id, organisation_id, contract_id, work_area_id, name, quantity, unit)
select '82000000-0000-0000-0000-000000000041', '82000000-0000-0000-0000-000000000010', contract_id, id, 'Ground floor corridor tiling', 120, 'm2'
from public.work_areas where id = '82000000-0000-0000-0000-000000000031';
insert into public.contract_assignments(contract_id, organisation_id, user_id)
select id, organisation_id, '82000000-0000-0000-0000-000000000002' from public.contracts;
insert into public.package_assignments(organisation_id, contract_id, work_package_id, user_id)
select organisation_id, contract_id, id, '82000000-0000-0000-0000-000000000003' from public.work_packages;
insert into public.document_revisions(id, organisation_id, contract_id, work_area_id, document_reference, revision, title, classification,
  object_path, sha256, mime_type, bytes, created_by)
select '82000000-0000-0000-0000-000000000051', organisation_id, contract_id, id, 'DRG-101', 1, 'Corridor setting out', 'operational',
  organisation_id || '/' || contract_id || '/operational/' || id || '/82000000-0000-0000-0000-000000000051.pdf', repeat('a', 64), 'application/pdf', 1024,
  '82000000-0000-0000-0000-000000000001'
from public.work_areas where id = '82000000-0000-0000-0000-000000000031';
-- A backdated inspection with an understated count, and a photo record without
-- a stored object: both possible before the hardening migration.
insert into public.supervisor_inspections(id, organisation_id, contract_id, actor_id, request_key, answers, issues_count, created_at)
select '82000000-0000-0000-0000-000000000061', organisation_id, id, '82000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000062',
  (select jsonb_agg(jsonb_build_object('item', 'Check ' || g, 'status', case when g = 1 then 'issue' else 'pass' end, 'note', 'Wet screed')) from generate_series(1, 10) g),
  0, now() - interval '20 days'
from public.contracts;
insert into public.supervisor_issue_photos(issue_id, organisation_id, actor_id, object_path)
select id, organisation_id, '82000000-0000-0000-0000-000000000002', organisation_id || '/' || id || '/legacy.jpg' from public.supervisor_issues;
commit;
SQL

snapshot() {
  "${psql[@]}" <<'SQL'
select string_agg(t || ':' || h, E'\n' order by t) from (
  select 'organisation_members' t, md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by user_id), '')) h from public.organisation_members x
  union all select 'contracts', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by id), '')) from public.contracts x
  union all select 'contract_commercials', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by contract_id), '')) from public.contract_commercials x
  union all select 'contract_assignments', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by contract_id, user_id), '')) from public.contract_assignments x
  union all select 'work_areas', md5(coalesce(string_agg(jsonb_build_object('id', id, 'organisation_id', organisation_id, 'contract_id', contract_id, 'name', name,
    'location', location, 'substrate_notes', substrate_notes, 'system_notes', system_notes, 'specification_revision', specification_revision,
    'created_by', created_by, 'created_at', created_at)::text, '|' order by id), '')) from public.work_areas
  union all select 'work_packages', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by id), '')) from public.work_packages x
  union all select 'package_assignments', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by work_package_id, user_id), '')) from public.package_assignments x
  union all select 'document_revisions', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by id), '')) from public.document_revisions x
  union all select 'audit_events', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by id), '')) from public.audit_events x
  union all select 'supervisor_inspections', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by id), '')) from public.supervisor_inspections x
  union all select 'supervisor_issues', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by id), '')) from public.supervisor_issues x
  union all select 'supervisor_issue_photos', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by id), '')) from public.supervisor_issue_photos x
) s;
SQL
}
installer_view() {
  "${psql[@]}" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"82000000-0000-0000-0000-000000000003"}', true) is not null;
select string_agg(id::text, ',' order by id) from public.work_areas;
select string_agg(id::text, ',' order by id) from public.document_revisions;
rollback;
SQL
}

before="$(snapshot)"
installer_before="$(installer_view)"
for migration in "$repository_root"/supabase/migrations/*.sql; do
  [[ "$(basename "$migration")" < "$first_v2_migration" ]] || "${psql[@]}" -f "$migration" >/dev/null
done
after="$(snapshot)"
installer_after="$(installer_view)"
if [[ "$before" != "$after" ]]; then
  diff <(echo "$before") <(echo "$after") >&2 || true
  echo 'FAIL: Supervisor V2 migrations changed existing operational records.' >&2
  exit 1
fi
if [[ "$installer_before" != "$installer_after" ]]; then
  echo 'FAIL: Supervisor V2 migrations changed what an existing installer can read.' >&2
  exit 1
fi

"${psql[@]}" <<'SQL'
select test.assert(true, 'every pre-existing member, contract, budget, allocation, area, package, document, audit event, inspection, issue and photo record is unchanged');
select test.assert(true, 'an existing installer reads exactly the same areas and documents after the upgrade');
select test.assert((select bool_and(parent_id is null and path_ids = array[id] and version = 1 and updated_at = created_at and archived_at is null)
  and count(*) = 3 from public.work_areas), 'existing areas become top-level locations with unchanged IDs');
select test.assert((select count(*) = 2 from public.work_areas where name = 'Corridor'), 'legacy duplicate area names neither block the upgrade nor get renamed');
select test.assert((select issues_count = 0 and created_at < now() - interval '19 days' from public.supervisor_inspections),
  'the hardening migration does not rewrite historical inspections');
select test.assert((select count(*) = 1 from public.supervisor_issue_photos), 'legacy photo records are preserved, not deleted');
SQL
