#!/usr/bin/env bash
# Stress harness orchestrator — Faza 1.
#
# Usage:
#   bash stress/bin/run-all.sh --smoke        # small seed, quick validation
#   bash stress/bin/run-all.sh --full         # full v1 seed (200/20/30/15k)
#   bash stress/bin/run-all.sh --keep-stack   # don't tear down on exit
#
# Faza 1 does NOT run any concurrency/k6/UI tests — it only proves the
# skeleton stands up end-to-end and prints READY.

set -euo pipefail

MODE="smoke"
KEEP_STACK=0
for arg in "$@"; do
  case "$arg" in
    --smoke) MODE="smoke" ;;
    --full)  MODE="full" ;;
    --keep-stack) KEEP_STACK=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STRESS="$ROOT/stress"
export STRESS_ENV_FILE="$STRESS/.env"
export STRESS_SEED_MODE="$MODE"

cleanup() {
  local ec=$?
  echo ""
  echo "=== cleanup ==="
  if [[ -n "${STRESS_SUPABASE_DB_URL:-}" ]]; then
    psql "$STRESS_SUPABASE_DB_URL" -v ON_ERROR_STOP=0 \
      -f "$STRESS/bin/resume-cron.sql" 2>&1 | sed 's/^/  /' || true
  fi
  if [[ "$KEEP_STACK" -eq 0 ]] && command -v supabase >/dev/null 2>&1; then
    supabase stop --no-backup 2>&1 | sed 's/^/  /' || true
  fi
  exit "$ec"
}
trap cleanup EXIT INT TERM

echo "=== 1/7 guard-env ==="
bash "$STRESS/bin/guard-env.sh"

# Load env for the rest of the run
# shellcheck disable=SC1090
set -a; source "$STRESS_ENV_FILE"; set +a

echo ""
echo "=== 2/7 supabase start ==="
if command -v supabase >/dev/null 2>&1; then
  supabase start 2>&1 | tail -20
else
  echo "supabase CLI not found — assuming compose fallback is already up"
  echo "(start it with: docker-compose -f $STRESS/docker-compose.stress.yml --profile stress up -d)"
fi

echo ""
echo "=== 3/7 reset-db ==="
bash "$STRESS/bin/reset-db.sh"

echo ""
echo "=== 4/7 pause-cron ==="
psql "$STRESS_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$STRESS/bin/pause-cron.sql"

echo ""
echo "=== 5/7 seed ($MODE) ==="
cd "$STRESS"
if [[ ! -d node_modules ]]; then
  echo "installing stress harness deps..."
  bun install 2>&1 | tail -5
fi
bun run seed/seed.ts

echo ""
echo "=== 6/7 auth pool (mode=${STRESS_AUTH_MODE:-login}) ==="
if [[ "${STRESS_AUTH_MODE:-login}" == "mint" ]]; then
  bun run seed/tokens.ts
else
  bun run seed/loginSeedUsers.ts
fi

echo ""
echo "=== 7/7 READY ==="
echo "harness mode:  $MODE"
echo "supabase url:  $STRESS_SUPABASE_URL"
echo "token pool:    $STRESS/reports/tokens.json"
echo "next phase:    layer2-concurrency (not implemented in Faza 1)"
echo ""
echo "READY"
