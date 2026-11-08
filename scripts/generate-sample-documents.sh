#!/usr/bin/env bash
# Regenerates the sample commercial documents from a fictitious job run through the real database
# functions: a fresh local PostgreSQL cluster with every migration, the scenario in
# scripts/sample-commercial-documents.sql, then the PDF renderer. Writes the database's snapshots to
# tests/fixtures/documents and the sample PDFs to docs/operations/samples. Nothing hosted is used.
set -euo pipefail
repository_root="$(cd "$(dirname "$0")/.." && pwd)"
pg_bin="${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}"
if [[ -z "$pg_bin" || ! -x "$pg_bin/initdb" ]]; then
  for candidate in /usr/lib/postgresql/*/bin; do [[ ! -x "$candidate/initdb" ]] || pg_bin="$candidate"; done
fi
[[ -x "$pg_bin/initdb" ]] || { echo 'PostgreSQL server binaries are required; set PG_BIN.' >&2; exit 1; }
work="$(mktemp -d "${TMPDIR:-/tmp}/tilespec-samples.XXXXXXXX")"
run_as=()
if [[ "$(id -u)" == 0 ]]; then chown postgres "$work"; run_as=(runuser -u postgres --); fi
cleanup() { "${run_as[@]}" "$pg_bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
"${run_as[@]}" "$pg_bin/initdb" -D "$work/data" -A trust -U postgres --no-locale >/dev/null
"${run_as[@]}" "$pg_bin/pg_ctl" -D "$work/data" -o "-p 5432 -k $work -c listen_addresses=''" -l "$work/postgres.log" -w start >/dev/null
psql=("$pg_bin/psql" -X -q -w -h "$work" -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1)
"${psql[@]}" -f "$repository_root/tests/db/platform.sql" >/dev/null
for migration in "$repository_root"/supabase/migrations/*.sql; do "${psql[@]}" -f "$migration" >/dev/null; done
fixtures="$repository_root/tests/fixtures/documents"
mkdir -p "$fixtures" "$work/out"
chmod 777 "$work/out"
"${psql[@]}" -v out="$work/out" -f "$repository_root/scripts/sample-commercial-documents.sql" >/dev/null
for file in "$work"/out/*.json; do
  # One line of JSON per document, pretty-printed for review.
  node -e 'const fs=require("fs");fs.writeFileSync(process.argv[2],JSON.stringify(JSON.parse(fs.readFileSync(process.argv[1],"utf8")),null,1)+"\n")' "$file" "$fixtures/$(basename "$file")"
done
(cd "$repository_root" && npx tsx scripts/render-sample-documents.ts "$fixtures" docs/operations/samples)
# Page previews for reviewing the sample payment application without a PDF viewer.
if command -v pdftoppm >/dev/null 2>&1; then
  pdftoppm -r 80 -png "$repository_root/docs/operations/samples/payment-application.pdf" "$repository_root/docs/operations/samples/payment-application-page"
fi
