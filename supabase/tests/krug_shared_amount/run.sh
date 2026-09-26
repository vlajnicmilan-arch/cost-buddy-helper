#!/usr/bin/env bash
# Krug „Dijeli samo X" — SQL čuvari S1–S9.
#   bash supabase/tests/krug_shared_amount/run.sh
# Slojevi: minimalna shema, žive definicije prije migracije, NULL snimka, migracija, čuvari.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/_roles.sql"
psql -v ON_ERROR_STOP=1 -q -f "$HERE/baseline.sql"
psql -v ON_ERROR_STOP=1 -q -f "$HERE/live_before.sql"
psql -v ON_ERROR_STOP=1 -q -f "$HERE/grants.sql"
psql -v ON_ERROR_STOP=1 -q -f "$HERE/seed_null.sql"
MIG="${KSA_MIG:-$(grep -l 'shared_amount_exceeds_amount' "$ROOT"/drizzle/migrations/*.sql | sort | tail -1)}"
echo "-- applying $(basename "$MIG")"
psql -v ON_ERROR_STOP=1 -q -f "$MIG"
psql -v ON_ERROR_STOP=1 -f "$HERE/guards.sql"
echo "krug shared amount SQL harness: done"
