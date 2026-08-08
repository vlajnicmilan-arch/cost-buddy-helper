#!/usr/bin/env bash
# Krug consent SQL harness runner.
#
#   bash supabase/tests/krug/run.sh
#
# 1) baseline.sql        — minimalna Krug shema + STARA insert politika
# 2) prave migracije pozivnica (KRUG_INVITE_MIGRATIONS.txt)
# 3) invitations_consent.sql — mora proci
#
# Bez koraka 2 test 1 pada ("FAIL 1") jer stara politika dopusta vlasniku
# izravan insert clanstva. To je ugradjeni dokaz da cuvar hvata regresiju.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
SKIP_MIGRATIONS="${SKIP_MIGRATIONS:-0}"

psql -v ON_ERROR_STOP=1 -q -f "$HERE/baseline.sql"

if [ "$SKIP_MIGRATIONS" != "1" ]; then
  while read -r m; do
    [ -z "$m" ] && continue
    case "$m" in \#*) continue ;; esac
    echo "-- applying $m"
    psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/$m"
  done < "$HERE/KRUG_INVITE_MIGRATIONS.txt"
fi

KRUG=$(psql -tA -q -c "insert into public.krug (name, preset, created_by) values ('harness','partner','00000000-0000-0000-0000-0000000000a1') returning id" | head -1)
psql -q -c "insert into public.krug_ownership (krug_id, user_id) values ('$KRUG','00000000-0000-0000-0000-0000000000a1')"
psql -q -c "insert into public.krug_membership (krug_id, user_id, role, added_by) values ('$KRUG','00000000-0000-0000-0000-0000000000a1','punopravni','00000000-0000-0000-0000-0000000000a1')" >/dev/null 2>&1 || true
psql -q -c "insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1','owner@example.test'),
  ('00000000-0000-0000-0000-0000000000b2','invitee@example.test'),
  ('00000000-0000-0000-0000-0000000000c3','other@example.test')
  on conflict do nothing"

psql -v ON_ERROR_STOP=1 \
  -v krug_id="'$KRUG'" \
  -v owner_id="'00000000-0000-0000-0000-0000000000a1'" \
  -v invitee_id="'00000000-0000-0000-0000-0000000000b2'" \
  -v other_id="'00000000-0000-0000-0000-0000000000c3'" \
  -f "$HERE/invitations_consent.sql"

# --- Faza 2: samoizlazak (krug_leave) ---------------------------------
if [ "$SKIP_MIGRATIONS" != "1" ]; then
  while read -r m; do
    [ -z "$m" ] && continue
    case "$m" in \#*) continue ;; esac
    echo "-- applying $m"
    psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/$m"
  done < "$HERE/KRUG_LEAVE_MIGRATIONS.txt"
fi

psql -v ON_ERROR_STOP=1 \
  -v krug_id="'$KRUG'" \
  -v owner_id="'00000000-0000-0000-0000-0000000000a1'" \
  -v member_id="'00000000-0000-0000-0000-0000000000b2'" \
  -f "$HERE/member_leave.sql"

# --- Cuvar: nema duplih overloada + accept smoke -----------------------
psql -v ON_ERROR_STOP=1 \
  -v krug_id="'$KRUG'" \
  -v owner_id="'00000000-0000-0000-0000-0000000000a1'" \
  -v invitee_id="'00000000-0000-0000-0000-0000000000b2'" \
  -f "$HERE/function_overloads.sql"

# --- Faza B: settlement flow (izvrsni test, ne samo struktura) ----------
if [ "$SKIP_MIGRATIONS" != "1" ]; then
  while read -r m; do
    [ -z "$m" ] && continue
    case "$m" in \#*) continue ;; esac
    echo "-- applying $m"
    psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/$m"
  done < "$HERE/KRUG_SETTLE_MIGRATIONS.txt"
fi

psql -q -c "insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d4','third@example.test') on conflict do nothing"
psql -v ON_ERROR_STOP=1 \
  -v krug_id="'$KRUG'" \
  -v debtor_id="'00000000-0000-0000-0000-0000000000c3'" \
  -v creditor_id="'00000000-0000-0000-0000-0000000000a1'" \
  -v third_id="'00000000-0000-0000-0000-0000000000d4'" \
  -f "$HERE/settlement_flow.sql"
