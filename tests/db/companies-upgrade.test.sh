#!/usr/bin/env bash
# Applies the subcontractor companies migration over gangs and operatives that
# were recorded with free-text company names, as the live database holds them.
# Proves the names are linked to company records by ID, spellings that differ
# only in case or spacing become one company, and every existing value is kept.
# Uses a separate scratch database in the disposable cluster.
set -euo pipefail
psql_binary="$1"
test_socket="$2"
test_port="$3"
repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
companies_migration=20261014100000
base=("$psql_binary" -X -q -A -t -w -h "$test_socket" -p "$test_port" -U postgres -v ON_ERROR_STOP=1)
"${base[@]}" -d postgres -c 'create database companies_upgrade' >/dev/null
trap '"${base[@]}" -d postgres -c "drop database if exists companies_upgrade" >/dev/null 2>&1 || true' EXIT
psql=("${base[@]}" -d companies_upgrade)

grep -v '^create role' "$repository_root/tests/db/platform.sql" | "${psql[@]}" >/dev/null
for migration in "$repository_root"/supabase/migrations/*.sql; do
  [[ "$(basename "$migration")" < "$companies_migration" ]] && "${psql[@]}" -f "$migration" >/dev/null
done

# Gangs and operatives as typed before company records existed.
"${psql[@]}" >/dev/null <<'SQL'
begin;
insert into auth.users(id, email) values
  ('f1000000-0000-0000-0000-000000000001', 'upgrade-manager@example.invalid'),
  ('f1000000-0000-0000-0000-000000000002', 'upgrade-other@example.invalid');
insert into public.organisations(id, name) values
  ('f2000000-0000-0000-0000-000000000001', 'Upgrade contractor'), ('f2000000-0000-0000-0000-000000000002', 'Other contractor');
insert into public.organisation_members(organisation_id, user_id, display_name, role, financial_access) values
  ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Manager', 'contracts_manager', false),
  ('f2000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000002', 'Other Owner', 'owner', true);
insert into public.teams(id, organisation_id, name, kind, contractor_name, version, created_at, updated_at) values
  ('f3000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Smith Gang A', 'subcontract_gang', 'Smith Tiling Ltd', 3, now() - interval '9 days', now() - interval '2 days'),
  ('f3000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000001', 'Smith Gang B', 'subcontract_gang', ' smith  tiling ltd ', 1, now() - interval '8 days', now() - interval '8 days'),
  ('f3000000-0000-0000-0000-000000000003', 'f2000000-0000-0000-0000-000000000001', 'Jones', 'subcontract_gang', 'Jones Installations', 1, now() - interval '8 days', now() - interval '8 days'),
  ('f3000000-0000-0000-0000-000000000004', 'f2000000-0000-0000-0000-000000000001', 'Direct A', 'direct_team', 'Upgrade contractor', 1, now() - interval '8 days', now() - interval '8 days'),
  ('f3000000-0000-0000-0000-000000000005', 'f2000000-0000-0000-0000-000000000001', 'Ward mixed', 'mixed', '', 1, now() - interval '8 days', now() - interval '8 days'),
  ('f3000000-0000-0000-0000-000000000006', 'f2000000-0000-0000-0000-000000000001', 'Wet', 'individual_subcontractor', 'Wet Area Specialists', 1, now() - interval '8 days', now() - interval '8 days'),
  ('f3000000-0000-0000-0000-000000000007', 'f2000000-0000-0000-0000-000000000002', 'Other Smith', 'subcontract_gang', 'Smith Tiling Ltd', 1, now() - interval '8 days', now() - interval '8 days');
insert into public.operatives(id, organisation_id, display_name, engagement, company_name, status, version, created_at, updated_at) values
  ('f4000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Sam Smith', 'subcontractor', 'Smith Tiling Ltd', 'active', 2, now() - interval '9 days', now() - interval '1 day'),
  ('f4000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000001', 'Tom Baker', 'subcontractor', 'SMITH TILING LTD', 'active', 1, now() - interval '9 days', now() - interval '9 days'),
  ('f4000000-0000-0000-0000-000000000003', 'f2000000-0000-0000-0000-000000000001', 'Lee Hart', 'subcontractor', 'Smith Tiling Ltd', 'inactive', 4, now() - interval '9 days', now() - interval '3 days'),
  ('f4000000-0000-0000-0000-000000000004', 'f2000000-0000-0000-0000-000000000001', 'Ava Kerr', 'agency', 'Site Labour Agency', 'provisional', 1, now() - interval '9 days', now() - interval '9 days'),
  ('f4000000-0000-0000-0000-000000000005', 'f2000000-0000-0000-0000-000000000001', 'Dan Price', 'direct_employee', 'Upgrade contractor', 'active', 1, now() - interval '9 days', now() - interval '9 days'),
  ('f4000000-0000-0000-0000-000000000006', 'f2000000-0000-0000-0000-000000000001', 'Kim Lowe', 'subcontractor', '', 'active', 1, now() - interval '9 days', now() - interval '9 days');
insert into public.team_memberships(organisation_id, team_id, operative_id, is_lead, valid_from) values
  ('f2000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000001', true, private.site_today() - 9),
  ('f2000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000002', false, private.site_today() - 9),
  ('f2000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000002', 'f4000000-0000-0000-0000-000000000004', false, private.site_today() - 9);
commit;
SQL

snapshot() {
  "${psql[@]}" <<'SQL'
select string_agg(t || ':' || h, E'\n' order by t) from (
  select 'teams' t, md5(coalesce(string_agg((to_jsonb(x) - 'company_id')::text, '|' order by id), '')) h from public.teams x
  union all select 'operatives', md5(coalesce(string_agg((to_jsonb(x) - 'company_id')::text, '|' order by id), '')) from public.operatives x
  union all select 'team_memberships', md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by id), '')) from public.team_memberships x
) s;
SQL
}
preflight() {
  printf 'begin transaction read only;\n\\i %s\nrollback;\n' "$repository_root/supabase/inspection/subcontractor-companies-preflight.sql" \
    | "${psql[@]}" -F '|'
}
report_value() { grep -F "$1" <<<"$2" | head -1 | awk -F'|' '{print $4}'; }

report_before="$(preflight)"
if grep -qE 'MISSING|ALREADY EXISTS' <<<"$report_before" \
  || [[ "$(report_value 'companies that will be created' "$report_before")" != 5 || "$(report_value 'gangs that will be linked' "$report_before")" != 5
    || "$(report_value 'operatives that will be linked' "$report_before")" != 4 || "$(report_value 'typed in more than one way' "$report_before")" != 1
    || "$(report_value 'direct teams or directly employed' "$report_before")" != 2 || "$(report_value 'no company name' "$report_before")" != 2
    || "$(grep -c '^backfill name|Smith Tiling Ltd|gangs 2, operatives 3|' <<<"$report_before")" != 1 ]]; then
  echo "$report_before" >&2
  echo 'FAIL: the companies preflight did not preview the backfill correctly.' >&2
  exit 1
fi

before="$(snapshot)"
migration_file="$(ls "$repository_root"/supabase/migrations/${companies_migration}_*.sql)"
"${psql[@]}" -f "$migration_file" >/dev/null
after="$(snapshot)"
if [[ "$before" != "$after" ]]; then
  diff <(echo "$before") <(echo "$after") >&2 || true
  echo 'FAIL: the companies migration changed existing gang, operative or membership values.' >&2
  exit 1
fi
report_after="$(preflight)"
if [[ "$(grep -c 'ALREADY EXISTS' <<<"$report_after")" != 13 ]] || grep -q '^backfill name' <<<"$report_after" \
  || [[ "$(grep '^row count' <<<"$report_before")" != "$(grep '^row count' <<<"$report_after")" ]]; then
  diff <(echo "$report_before") <(echo "$report_after") >&2 || true
  echo 'FAIL: the preflight after applying should show every new object, no pending backfill and unchanged row counts.' >&2
  exit 1
fi
if "${psql[@]}" -f "$migration_file" >"$test_socket/companies-reapply.log" 2>&1 || ! grep -q 'Preflight failed' "$test_socket/companies-reapply.log" \
  || [[ "$(snapshot)" != "$after" ]]; then
  cat "$test_socket/companies-reapply.log" >&2
  echo 'FAIL: the companies migration did not refuse to run a second time.' >&2
  exit 1
fi

# The assertions below are reached only after every shell comparison above passed.
"${psql[@]}" <<'SQL'
select test.assert(true, 'the read-only companies preflight previews the companies, links, merged spellings and unlinked names before applying');
select test.assert(true, 'every existing gang, operative and membership value is unchanged, including versions, timestamps and typed names');
select test.assert(true, 'after applying, the preflight shows every new object and identical row counts');
select test.assert(true, 'the companies migration refuses to run a second time, changing nothing');
select test.assert((select array_agg(name order by name) = array['Jones Installations', 'Site Labour Agency', 'Smith Tiling Ltd', 'Wet Area Specialists']
  from public.subcontractor_companies where organisation_id = 'f2000000-0000-0000-0000-000000000001'),
  'one company is created per distinct name, using the most common spelling');
select test.assert((select count(distinct company_id) = 1 and count(*) = 2 from public.teams where id in ('f3000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000002'))
  and (select count(distinct o.company_id) = 1 and bool_and(o.company_id = t.company_id) from public.operatives o, public.teams t
    where o.id in ('f4000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000002', 'f4000000-0000-0000-0000-000000000003')
      and t.id = 'f3000000-0000-0000-0000-000000000001'),
  'both Smith gangs and all three Smith operatives, typed three ways, now share one company ID');
select test.assert((select company_id <> (select company_id from public.teams where id = 'f3000000-0000-0000-0000-000000000001')
  from public.teams where id = 'f3000000-0000-0000-0000-000000000007'), 'a same-named company in another organisation stays a separate record');
select test.assert((select count(*) = 0 from public.teams where company_id is not null and id in ('f3000000-0000-0000-0000-000000000004', 'f3000000-0000-0000-0000-000000000005'))
  and (select count(*) = 0 from public.operatives where company_id is not null and id in ('f4000000-0000-0000-0000-000000000005', 'f4000000-0000-0000-0000-000000000006')),
  'direct teams, directly employed people and blank names are left unlinked');
select test.assert((select count(*) filter (where entity_type = 'subcontractor_companies' and action = 'insert') = 5
  and count(*) filter (where entity_type in ('teams', 'operatives') and action = 'update') = 9
  and count(*) filter (where entity_type in ('teams', 'operatives') and action = 'update' and details->'changed_fields' = '["company_id"]'::jsonb) = 9
  and bool_and(actor_id is null) from public.audit_events), 'each created company and each link is audited as administrative (no actor), changing only the company link');
select test.assert((select bool_and(active and version = 1 and created_by is null) from public.subcontractor_companies), 'backfilled companies start active');
SQL

# A form opened before the upgrade still saves, and keeps its company link.
"${psql[@]}" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000001"}', true) is not null;
select public.update_team('f3000000-0000-0000-0000-000000000001', 3, '{"name":"Smith Gang A (Level 5)"}');
select test.assert((select company_id is not null and contractor_name = 'Smith Tiling Ltd' and version = 4 from public.teams where id = 'f3000000-0000-0000-0000-000000000001'),
  'a gang edit made from a screen opened before the upgrade saves and keeps its company');
rollback;
SQL
