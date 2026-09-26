#!/usr/bin/env bash
# Krug — obični član sudjeluje samo kad ga prijedlog izričito uključi. SQL čuvari P1–P10.
#   bash supabase/tests/krug_participation/run.sh      (PG* prema bacivoj bazi)
# Slojevi: krug_shared_amount shema, 0029, 0033 (stanje prije), snimka, zadnja migracija, čuvari.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/_roles.sql"
KSA="$ROOT/supabase/tests/krug_shared_amount"
for f in baseline live_before grants; do psql -v ON_ERROR_STOP=1 -q -f "$KSA/$f.sql"; done
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/drizzle/migrations/0029_krug_split_shared_amount.sql" >/dev/null
psql -v ON_ERROR_STOP=1 -q -f "$HERE/setup.sql"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/drizzle/migrations/0033_krug_member_view_own_party.sql"
psql -v ON_ERROR_STOP=1 -q -f "$HERE/before.sql" >/dev/null
MIG="${KP_MIG:-$(grep -l 'krug_override_party' "$ROOT"/drizzle/migrations/*.sql | sort | tail -1)}"
echo "-- applying $(basename "$MIG")"
psql -v ON_ERROR_STOP=1 -q -f "$MIG"
psql -v ON_ERROR_STOP=1 -f "$HERE/guards.sql"
echo "krug participation SQL harness: done"
