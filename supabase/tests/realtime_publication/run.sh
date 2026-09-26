#!/usr/bin/env bash
# Živa salda — nalog 2: realtime publikacija (custom_payment_sources, krug_settlement_ledger).
#
#   bash supabase/tests/realtime_publication/run.sh           # primijeni migraciju i provjeri
#   TODAY=1 bash supabase/tests/realtime_publication/run.sh   # bez migracije: čuvari moraju pasti
#                                                             # (smisleno samo na svježoj bazi;
#                                                             #  živa baza već ima objavu)
#
# Traži PG* varijable prema bazi. Ne upisuje ništa u korisničke tablice.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/_roles.sql"
TODAY="${TODAY:-0}"

if [ "$TODAY" != "1" ]; then
  MIG="$(grep -l 'ALTER PUBLICATION supabase_realtime' "$ROOT"/drizzle/migrations/*.sql | sort | tail -1)"
  if [ -z "$MIG" ]; then
    echo "ERROR: migracija objave nije pronađena u drizzle/migrations/" >&2
    exit 1
  fi
  echo "-- applying $(basename "$MIG")"
  psql -v ON_ERROR_STOP=1 -q -f "$MIG"
  REAPPLY=1
else
  REAPPLY=0
fi

psql -v ON_ERROR_STOP=1 -v REAPPLY="$REAPPLY" -f "$HERE/publication.sql"
echo "realtime publication SQL harness: done (TODAY=$TODAY)"
