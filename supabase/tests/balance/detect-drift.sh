#!/usr/bin/env bash
# Drift check: any new/modified migration that touches balance-relevant tables
# MUST be listed in BALANCE_MIGRATIONS.txt or explicitly excluded in
# BALANCE_MIGRATIONS_IGNORE.txt.
#
# Rationale: baseline.sql covers a curated minimal schema. If a migration
# changes columns/functions/triggers on expenses / custom_payment_sources /
# app_settings and is not applied by the SQL suite, the deploy gate is a lie.
#
# Invoked by .github/workflows/balance-sql-suite.yml.
# Exits non-zero on drift; prints actionable message.

set -euo pipefail

BASE_REF="${BASE_REF:-origin/main}"
MIG_DIR="supabase/migrations"
WHITELIST="supabase/tests/balance/BALANCE_MIGRATIONS.txt"
IGNORE="supabase/tests/balance/BALANCE_MIGRATIONS_IGNORE.txt"

# Balance-relevant identifiers to grep in migration bodies.
PATTERN='expenses|custom_payment_sources|app_settings|correction_anchor|anchor_engine_mode|recompute_custom_source_balance|_extract_custom_source_id|expenses_event_at_sync|_expenses_recompute_source_balance|event_at|time_confidence|user_edited_event_at'

# Collect basenames from a whitelist/ignore file (skip comments/blank).
collect() {
  local file="$1"
  [ -f "$file" ] || return 0
  sed -E 's/[[:space:]]*#.*$//' "$file" | awk 'NF'
}

whitelist_globs="$(collect "$WHITELIST" || true)"
ignore_globs="$(collect "$IGNORE" || true)"

# Match a basename against a set of globs.
matches_globs() {
  local name="$1"
  local globs="$2"
  [ -z "$globs" ] && return 1
  while IFS= read -r g; do
    [ -z "$g" ] && continue
    # shellcheck disable=SC2053
    case "$name" in $g) return 0 ;; esac
  done <<< "$globs"
  return 1
}

# Determine changed migration files vs BASE_REF. If git ref is missing (e.g.
# shallow clone without base), fall back to scanning ALL migrations so drift
# is still visible.
if git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  changed="$(git diff --name-only --diff-filter=AM "$BASE_REF"...HEAD -- "$MIG_DIR" || true)"
  scope="changed vs $BASE_REF"
else
  echo "detect-drift: BASE_REF '$BASE_REF' not available, scanning all migrations"
  changed="$(ls "$MIG_DIR"/*.sql 2>/dev/null || true)"
  scope="ALL migrations (no base ref)"
fi

if [ -z "$changed" ]; then
  echo "detect-drift: no migration files in scope ($scope) — OK"
  exit 0
fi

drift=0
while IFS= read -r path; do
  [ -z "$path" ] && continue
  [ -f "$path" ] || continue
  base="$(basename "$path")"

  # Only care about files that actually reference balance-relevant symbols.
  if ! grep -Eq "$PATTERN" "$path"; then
    continue
  fi

  if matches_globs "$base" "$whitelist_globs"; then
    continue
  fi
  if matches_globs "$base" "$ignore_globs"; then
    echo "detect-drift: $base — balance-adjacent but explicitly ignored"
    continue
  fi

  echo "DRIFT: $base touches balance-relevant schema but is not listed in"
  echo "       $WHITELIST (or $IGNORE)."
  drift=1
done <<< "$changed"

if [ "$drift" -ne 0 ]; then
  cat <<EOF >&2

Balance drift detected. Every migration that touches expenses,
custom_payment_sources, app_settings, or the anchor/recompute engine MUST be
either:
  (a) added to $WHITELIST  — if it affects balance semantics, so the SQL
      suite exercises it; OR
  (b) added to $IGNORE     — with a comment explaining why the change is
      balance-neutral (RLS-only, GRANT-only, unrelated column, etc.).

Fix by editing one of those files in the same PR, then re-push.
EOF
  exit 1
fi

echo "detect-drift: OK ($scope)"
