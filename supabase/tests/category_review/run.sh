#!/usr/bin/env bash
# Pregled kategorija — SQL čuvari C1–C13.
#
#   bash supabase/tests/category_review/run.sh           # zadnja migracija (mora biti zeleno)
#   TODAY=1 bash supabase/tests/category_review/run.sh   # bez migracije: čuvari padaju
#
# Podloga: balance bootstrap/baseline + balance migracije (pravi okidač salda).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
BAL="$ROOT/supabase/tests/balance"
TODAY="${TODAY:-0}"

psql -v ON_ERROR_STOP=1 -q -f "$BAL/bootstrap.sql" || exit 1
psql -v ON_ERROR_STOP=1 -q -f "$BAL/baseline.sql" || exit 1
while read -r m; do
  m="${m%%#*}"; m="$(echo "$m" | xargs || true)"
  [ -z "$m" ] && continue
  for f in "$ROOT"/supabase/migrations/$m; do
    [ -e "$f" ] || continue
    psql -v ON_ERROR_STOP=1 -q -f "$f" || exit 1
  done
done < "$BAL/BALANCE_MIGRATIONS.txt"
psql -v ON_ERROR_STOP=1 -q -f "$HERE/baseline.sql" || exit 1

if [ "$TODAY" != "1" ]; then
  SRC="${CATEGORY_REVIEW_SRC:-$(grep -l 'CREATE OR REPLACE FUNCTION public.category_review_apply' "$ROOT"/drizzle/migrations/*.sql 2>/dev/null | sort | tail -1)}"
  [ -n "$SRC" ] || { echo "ERROR: no migration defines category_review_apply" >&2; exit 1; }
  echo "-- applying $(basename "$SRC")"
  psql -v ON_ERROR_STOP=1 -q -f "$SRC" || exit 1
fi
psql -f "$HERE/guards.sql" 2>&1 | sed 's/^psql:[^N]*NOTICE:  //'
echo "category review SQL harness: done (TODAY=$TODAY)"
