#!/usr/bin/env bash
# Reset local Supabase DB and apply all migrations.
# Prefers `supabase db reset` (idiomatic). Falls back to psql-only reset if
# Supabase CLI is unavailable AND compose fallback is running.
set -euo pipefail

if command -v supabase >/dev/null 2>&1; then
  echo "reset-db: using supabase CLI"
  supabase db reset --local
  exit 0
fi

if [[ -z "${STRESS_SUPABASE_DB_URL:-}" ]]; then
  echo "reset-db: supabase CLI missing and STRESS_SUPABASE_DB_URL not set" >&2
  exit 1
fi

echo "reset-db: falling back to psql against $STRESS_SUPABASE_DB_URL"
psql "$STRESS_SUPABASE_DB_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Apply migrations in lexical order (matches Supabase CLI behavior)
MIG_DIR="$(cd "$(dirname "$0")/../.." && pwd)/supabase/migrations"
if [[ -d "$MIG_DIR" ]]; then
  for f in "$MIG_DIR"/*.sql; do
    echo "reset-db: applying $(basename "$f")"
    psql "$STRESS_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
  done
fi

echo "reset-db: done"
