#!/usr/bin/env bash
# Acceptance tests always use a fresh, local PostgreSQL cluster. No external
# connection URL or configured Supabase database is consulted.
set -euo pipefail

repository_root="$(cd "$(dirname "$0")/.." && pwd)"
pg_bin="${PG_BIN:-}"
if [[ -z "$pg_bin" ]]; then
  if [[ -x /workspace/.onboarding/postgres/root/usr/lib/postgresql/17/bin/initdb ]]; then
    pg_bin=/workspace/.onboarding/postgres/root/usr/lib/postgresql/17/bin
  elif command -v pg_config >/dev/null 2>&1; then
    pg_bin="$(pg_config --bindir)"
  else
    for candidate in /usr/lib/postgresql/*/bin; do
      [[ ! -x "$candidate/initdb" ]] || pg_bin="$candidate"
    done
  fi
fi
if [[ -z "$pg_bin" || ! -x "$pg_bin/initdb" || ! -x "$pg_bin/psql" ]]; then
  echo 'test-db: PostgreSQL server/client binaries are required; set PG_BIN.' >&2
  exit 1
fi

# Support the managed environment's relocatable, verified PostgreSQL package.
package_root="$(cd "$pg_bin/../../../.." && pwd)"
if [[ -d "$package_root/lib/x86_64-linux-gnu" ]]; then
  export LD_LIBRARY_PATH="$package_root/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

test_directory="$(mktemp -d "${TMPDIR:-/tmp}/tilespec-db.XXXXXXXX")"
run_as=()
if [[ "$(id -u)" == 0 ]]; then
  if ! id postgres >/dev/null 2>&1; then
    echo 'test-db: initdb cannot run as root; install/create the postgres OS account.' >&2
    rm -rf "$test_directory"
    exit 1
  fi
  chown postgres "$test_directory"
  run_as=(runuser -u postgres --)
fi
cleanup() {
  "${run_as[@]}" "$pg_bin/pg_ctl" -D "$test_directory/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$test_directory"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"${run_as[@]}" "$pg_bin/initdb" -D "$test_directory/data" -A trust -U postgres --no-locale >"$test_directory/init.log" 2>&1 || {
  cat "$test_directory/init.log" >&2
  exit 1
}
# A private Unix socket and no listening TCP interface ensure the test cluster
# cannot connect to, replace, or expose a running application database.
"${run_as[@]}" "$pg_bin/pg_ctl" -D "$test_directory/data" \
  -o "-p 5432 -k $test_directory -c listen_addresses=''" \
  -l "$test_directory/postgres.log" -w start >/dev/null || {
  cat "$test_directory/postgres.log" >&2
  exit 1
}
psql=("$pg_bin/psql" -X -q -w -h "$test_directory" -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1)

"${psql[@]}" -f "$repository_root/tests/db/platform.sql"
shopt -s nullglob
migrations=("$repository_root"/supabase/migrations/*.sql)
tests=("$repository_root"/tests/db/*.test.sql)
concurrent_tests=("$repository_root"/tests/db/*.test.sh)
if (( ${#migrations[@]} == 0 || ${#tests[@]} == 0 )); then
  echo 'test-db: migrations and acceptance SQL files must exist.' >&2
  exit 1
fi
for migration in "${migrations[@]}"; do
  "${psql[@]}" -f "$migration" >"$test_directory/migration.log" 2>&1 || {
    cat "$test_directory/migration.log" >&2
    exit 1
  }
done

failed=0
for test_file in "${tests[@]}"; do
  echo "Running $(basename "$test_file")"
  if "${psql[@]}" -f "$test_file" >"$test_directory/test.log" 2>&1; then
    sed -n 's/^.*NOTICE:  / /p' "$test_directory/test.log"
  else
    cat "$test_directory/test.log" >&2
    failed=1
  fi
done
for test_file in "${concurrent_tests[@]}"; do
  echo "Running $(basename "$test_file")"
  if bash "$test_file" "$pg_bin/psql" "$test_directory" 5432 >"$test_directory/test.log" 2>&1; then
    sed -n 's/^.*NOTICE:  / /p' "$test_directory/test.log"
  else
    cat "$test_directory/test.log" >&2
    failed=1
  fi
done
exit "$failed"
