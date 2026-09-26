#!/usr/bin/env bash
# Krug „tko kome" za običnog člana — SQL čuvari V1–V8.
#   bash supabase/tests/krug_member_view/run.sh      (PG* prema bacivoj bazi)
# Slojevi: krug_shared_amount shema + žive definicije (0029), podaci, snimka prije, migracija, čuvari.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/_roles.sql"
KSA="$ROOT/supabase/tests/krug_shared_amount"
for f in baseline live_before grants; do psql -v ON_ERROR_STOP=1 -q -f "$KSA/$f.sql"; done
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/drizzle/migrations/0029_krug_split_shared_amount.sql" >/dev/null
psql -v ON_ERROR_STOP=1 -q -f "$HERE/setup.sql"
psql -v ON_ERROR_STOP=1 -q -f "$HERE/before.sql"
MIG="${KMV_MIG:-$(grep -l 'ledger_select_own_party' "$ROOT"/drizzle/migrations/*.sql | sort | tail -1)}"
echo "-- applying $(basename "$MIG")"
psql -v ON_ERROR_STOP=1 -q -f "$MIG"
psql -v ON_ERROR_STOP=1 -f "$HERE/guards.sql"
echo "krug member view SQL harness: done"
