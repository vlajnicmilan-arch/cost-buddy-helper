#!/usr/bin/env bash
# Radnici — „Nisam primio" + isplate na čekanju. SQL čuvari N1–N8.
#   bash supabase/tests/worker_payout_report/run.sh
# Slojevi: worker_payout_notify podloga + outbox migracije (0020/0021/0023/0025), vlastiti dodaci, migracija.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
M="$ROOT/drizzle/migrations"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/worker_payout_notify/baseline.sql"
for f in 0020_krug_notify_outbox_table 0021_krug_notify_outbox_mark_delivered 0023_krug_outbox_privileges 0025_worker_payout_notify_outbox_real; do
  psql -v ON_ERROR_STOP=1 -q -f "$M/$f.sql"
done
psql -v ON_ERROR_STOP=1 -q -f "$HERE/baseline.sql"
MIG="${WNR_MIG:-$(grep -l 'FUNCTION public.worker_report_payout_not_received' "$M"/*.sql | sort | tail -1)}"
echo "-- applying $(basename "$MIG")"
psql -v ON_ERROR_STOP=1 -q -f "$MIG"
psql -v ON_ERROR_STOP=1 -f "$HERE/guards.sql"
echo "worker payout report SQL harness: done"
