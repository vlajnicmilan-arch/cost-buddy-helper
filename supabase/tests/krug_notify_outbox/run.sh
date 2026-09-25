#!/usr/bin/env bash
# Krug pouzdana isporuka obavijesti — SQL čuvari za outbox + retry.
#
#   bash supabase/tests/krug_notify_outbox/run.sh            # puni paket
#   TODAY=1 bash supabase/tests/krug_notify_outbox/run.sh    # bez outbox migracija:
#                                                            # dokaz da čuvari padaju
#
# Slojevi: kao krug_settle (balance + merge + krug baseline + settle migracija),
# zatim outbox tablica (0020), mark_delivered (0021) i emit/retry (emit_retry.sql).
# Traži PG* varijable prema bacivoj bazi.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
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
  "$MERGE_FN_SRC" > /tmp/krug_outbox_merge_fn.sql
echo "-- applying $(basename "$MERGE_FN_SRC") (merge_manual_with_bank block)"
psql -v ON_ERROR_STOP=1 -q -f /tmp/krug_outbox_merge_fn.sql

psql -v ON_ERROR_STOP=1 -q -f "$HERE/../krug_settle/baseline.sql"

# krug_is_member + krug_act_dedup + krug_apply_act (prva i zadnja definicija)
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/20260604191820_d11eb7b6-53fb-47a4-9c9c-89b7387210d4.sql"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/20260604210100_75995acc-7985-499e-b6e9-c1ca4691a938.sql"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/20260808183340_c42e3369-721d-4d55-959a-6a041c2fa120.sql"

SETTLE_SRC="$(grep -l 'CREATE OR REPLACE FUNCTION public.krug_mark_settled_with_source' "$ROOT"/drizzle/migrations/*.sql | sort | tail -1)"
echo "-- applying $(basename "$SETTLE_SRC")"
psql -v ON_ERROR_STOP=1 -q -f "$SETTLE_SRC"

if [ "$TODAY" != "1" ]; then
  psql -v ON_ERROR_STOP=1 -q -f "$ROOT/drizzle/migrations/0020_krug_notify_outbox_table.sql"
  psql -v ON_ERROR_STOP=1 -q -f "$ROOT/drizzle/migrations/0021_krug_notify_outbox_mark_delivered.sql"
  psql -v ON_ERROR_STOP=1 -q -f "$HERE/emit_retry.sql"
  psql -v ON_ERROR_STOP=1 -f "$HERE/outbox.sql"
else
  # Svaki čuvar je zaseban DO blok; bez outbox migracija svaki mora pasti.
  psql -v ON_ERROR_STOP=0 -f "$HERE/outbox.sql" || true
fi
echo "krug notify outbox SQL harness: done (TODAY=$TODAY)"
