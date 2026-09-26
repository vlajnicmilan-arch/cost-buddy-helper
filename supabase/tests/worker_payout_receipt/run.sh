#!/usr/bin/env bash
# Radnici — potvrda primitka isplate (worker_confirm_payout_receipt). SQL čuvari R1–R10.
#   bash supabase/tests/worker_payout_receipt/run.sh
# Slojevi: balance bootstrap/baseline + balance migracije (isplate, okidač salda),
# krug_settle baseline (profiles, payment_source_members, can_write_payment_source,
# client_request_id), vlastiti dodaci, zatim migracija RPC-a.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/_roles.sql"
BAL="$ROOT/supabase/tests/balance"
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
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/merge/baseline_extra.sql"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/krug_settle/baseline.sql"
psql -v ON_ERROR_STOP=1 -q -f "$HERE/baseline.sql"
MIG="${WPR_MIG:-$(grep -l 'FUNCTION public.worker_confirm_payout_receipt' "$ROOT"/drizzle/migrations/*.sql | sort | tail -1)}"
echo "-- applying $(basename "$MIG")"
psql -v ON_ERROR_STOP=1 -q -f "$MIG"
psql -v ON_ERROR_STOP=1 -f "$HERE/guards.sql"
echo "worker payout receipt SQL harness: done"
