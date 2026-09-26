#!/usr/bin/env bash
# Radnici — obavijest o isplati na serveru + push kroz outbox. SQL čuvari WP1–WP8.
#   bash supabase/tests/worker_payout_notify/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/_roles.sql"
M="$ROOT/drizzle/migrations"
psql -v ON_ERROR_STOP=1 -q -f "$HERE/baseline.sql"
for f in 0020_krug_notify_outbox_table 0021_krug_notify_outbox_mark_delivered 0023_krug_outbox_privileges; do
  psql -v ON_ERROR_STOP=1 -q -f "$M/$f.sql"
done
WP="${WP_MIG:-$(ls "$M"/*worker_payout_notify_outbox*.sql | tail -1)}"
echo "-- applying $(basename "$WP")"
psql -v ON_ERROR_STOP=1 -q -f "$WP"
psql -v ON_ERROR_STOP=1 -f "$HERE/guards.sql"
echo "worker payout notify SQL harness: done"
