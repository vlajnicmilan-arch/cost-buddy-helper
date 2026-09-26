#!/usr/bin/env bash
# Red „Na pregled" — SQL čuvari R1–R14 na balance baselineu (stvarni okidač salda).
#   bash supabase/tests/bank_sync_review/run.sh   (PG* mora pokazivati na PRIVREMENU bazu)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/_roles.sql"
B="$ROOT/supabase/tests/balance"
psql -v ON_ERROR_STOP=1 -q -f "$B/bootstrap.sql" >/dev/null
psql -v ON_ERROR_STOP=1 -q -f "$B/baseline.sql" >/dev/null
sed -E 's/[[:space:]]*#.*$//' "$B/BALANCE_MIGRATIONS.txt" | awk 'NF' | while read -r g; do
  for f in "$ROOT"/supabase/migrations/$g; do psql -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>&1; done
done
psql -v ON_ERROR_STOP=1 -q -f "$HERE/setup.sql"
for f in $(grep -l -e 'bank_sync_review_queue' -e 'bank_sync_review_decide' "$ROOT"/drizzle/migrations/*.sql | sort); do
  echo "-- applying $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -q -f "$f"
done
psql -v ON_ERROR_STOP=1 -f "$HERE/guards.sql"
echo "bank sync review SQL harness: done"
