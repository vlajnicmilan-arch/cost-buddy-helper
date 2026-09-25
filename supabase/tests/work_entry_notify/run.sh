#!/usr/bin/env bash
# Obavijest o upisanim satima + povezivanje radnika — SQL čuvari W1–W4.
#
#   bash supabase/tests/work_entry_notify/run.sh           # zadnja migracija (mora biti zeleno)
#   TODAY=1 bash supabase/tests/work_entry_notify/run.sh   # stanje prije popravka: čuvari padaju
#
# link_worker_to_member je doslovna živa definicija (ne mijenja se).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
TODAY="${TODAY:-0}"

psql -v ON_ERROR_STOP=1 -q -f "$HERE/baseline.sql" || exit 1
psql -v ON_ERROR_STOP=1 -q -f "$HERE/live_link_worker_to_member.sql" || exit 1
if [ "$TODAY" = "1" ]; then
  FN_SRC="$HERE/today_notify_fn.sql"
else
  FN_SRC="$(grep -l 'CREATE OR REPLACE FUNCTION public.trg_work_entry_notify_worker' "$ROOT"/drizzle/migrations/*.sql | sort | tail -1)"
  [ -n "$FN_SRC" ] || { echo "ERROR: no migration defines trg_work_entry_notify_worker" >&2; exit 1; }
  grep -v '^[[:space:]]*--' "$FN_SRC" | grep -q 'full_name' && { echo "ERROR: $FN_SRC still reads profiles.full_name" >&2; exit 1; }
fi
echo "-- applying $(basename "$FN_SRC")"
psql -v ON_ERROR_STOP=1 -q -f "$FN_SRC" || exit 1
psql -v ON_ERROR_STOP=1 -q -c "CREATE TRIGGER trg_work_entry_notify_worker_insert AFTER INSERT ON public.project_work_entries FOR EACH ROW EXECUTE FUNCTION public.trg_work_entry_notify_worker();" || exit 1
# Svaki čuvar zaseban: pad jednog ne skriva ostale.
psql -v ON_ERROR_STOP=0 -f "$HERE/guards.sql"
echo "work entry notify SQL harness: done (TODAY=$TODAY)"
