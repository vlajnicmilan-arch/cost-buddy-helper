#!/usr/bin/env bash
# Manual ↔ bank merge SQL harness runner.
#
#   bash supabase/tests/merge/run.sh
#
# Layers (same architecture as the balance suite):
#   1) supabase/tests/balance/bootstrap.sql  — auth/storage/role stubs
#   2) supabase/tests/balance/baseline.sql   — curated expenses/custom_payment_sources
#   3) BALANCE_MIGRATIONS.txt                — balance engine (trigger owns the balance)
#   4) supabase/tests/merge/baseline_extra.sql — bank/import columns + unique index
#   5) the merge_manual_with_bank migration  — MERGE_MIGRATIONS.txt
#   6) manual_bank_merge.sql                 — the assertions
#
# Requires PG* env vars pointing at a throwaway Postgres.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
BAL="$ROOT/supabase/tests/balance"

psql -v ON_ERROR_STOP=1 -q -f "$BAL/bootstrap.sql"
psql -v ON_ERROR_STOP=1 -q -f "$BAL/baseline.sql"

apply_list() {
  local list="$1"
  while read -r m; do
    m="${m%%#*}"
    m="$(echo "$m" | xargs || true)"
    [ -z "$m" ] && continue
    for f in "$ROOT"/supabase/migrations/$m; do
      [ -e "$f" ] || continue
      echo "-- applying $(basename "$f")"
      psql -v ON_ERROR_STOP=1 -q -f "$f"
    done
  done < "$list"
}

apply_list "$BAL/BALANCE_MIGRATIONS.txt"
psql -v ON_ERROR_STOP=1 -q -f "$HERE/baseline_extra.sql"
apply_list "$HERE/MERGE_MIGRATIONS.txt"

# Zadnja Drizzle migracija koja redefinira merge_manual_with_bank (0012, 0013,
# i svaka buduća). Iz nje se primjenjuje samo blok funkcije (CREATE OR REPLACE
# ... do njezina GRANT EXECUTE), jer ostatak migracije ne pripada baselineu.
MERGE_FN_SRC="$(grep -l 'CREATE OR REPLACE FUNCTION public.merge_manual_with_bank' "$ROOT"/drizzle/migrations/*.sql | sort | tail -1)"
if [ -z "$MERGE_FN_SRC" ]; then
  echo "ERROR: no drizzle migration redefines merge_manual_with_bank" >&2
  exit 1
fi
awk '/CREATE OR REPLACE FUNCTION public\.merge_manual_with_bank/{on=1}
     on{print}
     on && /GRANT EXECUTE ON FUNCTION public\.merge_manual_with_bank/{exit}' \
  "$MERGE_FN_SRC" > /tmp/merge_fn_latest.sql
echo "-- applying $(basename "$MERGE_FN_SRC") (merge_manual_with_bank block)"
psql -v ON_ERROR_STOP=1 -q -f /tmp/merge_fn_latest.sql

# Brana: testirana funkcija mora imati živo pravilo valute (NULL = EUR).
if ! psql -Atc "SELECT pg_get_functiondef('public.merge_manual_with_bank(uuid,uuid)'::regprocedure)" \
     | grep -q "COALESCE(v_manual.currency, *'EUR')"; then
  echo "ERROR: tested merge_manual_with_bank lacks COALESCE(currency,'EUR') — harness is not testing the live definition (source: $(basename "$MERGE_FN_SRC"))" >&2
  exit 1
fi
echo "-- gate OK: merge_manual_with_bank has COALESCE(currency,'EUR')"

psql -v ON_ERROR_STOP=1 -f "$HERE/manual_bank_merge.sql"
echo "merge SQL harness: OK"
