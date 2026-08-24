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

psql -v ON_ERROR_STOP=1 -f "$HERE/manual_bank_merge.sql"
echo "merge SQL harness: OK"
