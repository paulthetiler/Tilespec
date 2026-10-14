#!/usr/bin/env bash
# Runs the real office server actions against a scratch database with every
# migration applied, and checks every database call and column list in the
# application against the migrated schema. See tests/rpc-contract/office-actions.ts.
set -euo pipefail
psql_binary="$1"
test_socket="$2"
test_port="$3"
repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
base=("$psql_binary" -X -q -A -t -w -h "$test_socket" -p "$test_port" -U postgres -v ON_ERROR_STOP=1)
"${base[@]}" -d postgres -c 'create database office_actions' >/dev/null
trap '"${base[@]}" -d postgres -c "drop database if exists office_actions" >/dev/null 2>&1 || true' EXIT
psql=("${base[@]}" -d office_actions)

grep -v '^create role' "$repository_root/tests/db/platform.sql" | "${psql[@]}" >/dev/null
for migration in "$repository_root"/supabase/migrations/*.sql; do "${psql[@]}" -f "$migration" >/dev/null; done
"${psql[@]}" >/dev/null <<'SQL'
insert into auth.users(id, email) values
  ('a7100000-0000-4000-8000-000000000001', 'contract-manager@example.invalid'),
  ('a7100000-0000-4000-8000-000000000002', 'contract-supervisor@example.invalid');
insert into public.organisations(id, name) values ('a7000000-0000-4000-8000-000000000001', 'Office actions contractor');
insert into public.organisation_members(organisation_id, user_id, display_name, role, financial_access) values
  ('a7000000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001', 'Manager', 'contracts_manager', false),
  ('a7000000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000002', 'Supervisor', 'supervisor', false);
insert into public.contracts(id, organisation_id, reference, name, created_by) values
  ('a7000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000001', 'APT-C', 'Canal apartments', 'a7100000-0000-4000-8000-000000000001');
insert into public.contract_assignments(contract_id, organisation_id, user_id) values
  ('a7000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001'),
  ('a7000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000002');
SQL

cd "$repository_root"
output="$(TSX_TSCONFIG_PATH=tests/rpc-contract/tsconfig.json node --import tsx tests/rpc-contract/office-actions.ts \
  "$psql_binary" "$test_socket" "$test_port" office_actions "$repository_root" 2>&1)" || { echo "$output" >&2; exit 1; }
grep -q '^ ok - all [0-9]* office actions ran' <<<"$output" || { echo "$output" >&2; exit 1; }
# Report each passed check through the shared runner's NOTICE convention.
sed -n 's/^ ok - \(.*\)$/select test.assert(true, $check$\1$check$);/p' <<<"$output" | "${psql[@]}"
