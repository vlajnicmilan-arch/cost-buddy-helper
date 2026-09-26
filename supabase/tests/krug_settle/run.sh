#!/usr/bin/env bash
# Krug podmirenje s izborom izvora — SQL čuvari.
#
#   bash supabase/tests/krug_settle/run.sh            # puni paket (mora biti zeleno)
#   TODAY=1 bash supabase/tests/krug_settle/run.sh    # bez migracije podmirenja:
#                                                     # dokaz da čuvari padaju
#
# Slojevi: balance bootstrap/baseline + balance migracije, merge baseline_extra,
# zadnja definicija merge_manual_with_bank, krug baseline (žive definicije),
# zatim zadnja migracija koja definira krug_mark_settled_with_source.
# Traži PG* varijable prema bacivoj bazi.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/_roles.sql"
BAL="$ROOT/supabase/tests/balance"
MERGE="$ROOT/supabase/tests/merge"
TODAY="${TODAY:-0}"

psql -v ON_ERROR_STOP=1 -q -f "$BAL/bootstrap.sql"
psql -v ON_ERROR_STOP=1 -q -f "$BAL/baseline.sql"
while read -r m; do
  m="${m%%#*}"; m="$(echo "$m" | xargs || true)"
  [ -z "$m" ] && continue
  for f in "$ROOT"/supabase/migrations/$m; do
    [ -e "$f" ] || continue
    psql -v ON_ERROR_STOP=1 -q -f "$f"
  done
done < "$BAL/BALANCE_MIGRATIONS.txt"
psql -v ON_ERROR_STOP=1 -q -f "$MERGE/baseline_extra.sql"

MERGE_FN_SRC="$(grep -l 'CREATE OR REPLACE FUNCTION public.merge_manual_with_bank' "$ROOT"/drizzle/migrations/*.sql | sort | tail -1)"
awk '/CREATE OR REPLACE FUNCTION public\.merge_manual_with_bank/{on=1}
     on{print}
     on && /GRANT EXECUTE ON FUNCTION public\.merge_manual_with_bank/{exit}' \
  "$MERGE_FN_SRC" > /tmp/krug_settle_merge_fn.sql
echo "-- applying $(basename "$MERGE_FN_SRC") (merge_manual_with_bank block)"
psql -v ON_ERROR_STOP=1 -q -f /tmp/krug_settle_merge_fn.sql

psql -v ON_ERROR_STOP=1 -q -f "$HERE/baseline.sql"

if [ "$TODAY" != "1" ]; then
  SETTLE_SRC="$(grep -l 'CREATE OR REPLACE FUNCTION public.krug_mark_settled_with_source' "$ROOT"/drizzle/migrations/*.sql | sort | tail -1)"
  if [ -z "$SETTLE_SRC" ]; then
    echo "ERROR: no drizzle migration defines krug_mark_settled_with_source" >&2
    exit 1
  fi
  echo "-- applying $(basename "$SETTLE_SRC")"
  psql -v ON_ERROR_STOP=1 -q -f "$SETTLE_SRC"
  psql -v ON_ERROR_STOP=1 -f "$HERE/settlement_with_source.sql"
else
  # Svaki čuvar je zaseban DO blok; bez migracije svaki mora pasti.
  psql -v ON_ERROR_STOP=0 -f "$HERE/settlement_with_source.sql" || true
fi
echo "krug settle SQL harness: done (TODAY=$TODAY)"
