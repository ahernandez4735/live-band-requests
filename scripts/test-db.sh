#!/usr/bin/env bash
# Runs the migration and queue tests against a throwaway local Postgres database.
# Needs psql and a local server you can connect to (PGHOST/PGUSER as usual).
set -euo pipefail
cd "$(dirname "$0")/.."
DB="lbr_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/stub_supabase.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/migrations/20261008000000_init.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/queue_test.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "select 1" >/dev/null
DB="$DB" bash supabase/tests/concurrency_test.sh
