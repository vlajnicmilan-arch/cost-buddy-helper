#!/usr/bin/env bash
# "Ljudi — veza s Centar računom" SQL harness.
#
#   bash supabase/tests/people/run.sh
#
# 1) baseline.sql       — minimalna shema (workers, project_workers, projects, dijagnostika)
# 2) migracija iz PEOPLE_LINK_MIGRATIONS.txt
# 3) person_link.sql    — scenariji PL1–PL6
#
# NE dira saldo, pa NIJE dio balance harnessa.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"

psql -v ON_ERROR_STOP=1 -q -f "$HERE/baseline.sql"

while read -r m; do
  [ -z "$m" ] && continue
  case "$m" in \#*) continue ;; esac
  echo "-- applying $m"
  psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/$m"
done < "$HERE/PEOPLE_LINK_MIGRATIONS.txt"

psql -v ON_ERROR_STOP=1 -f "$HERE/person_link.sql"
