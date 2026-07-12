#!/usr/bin/env bash
# Stress harness orchestrator — Faza 1 + Faza 2 (Layer 2 concurrency).
#
# Usage:
#   bash stress/bin/run-all.sh --smoke        # small seed, quick validation
#   bash stress/bin/run-all.sh --layer=2      # smoke pipeline + Layer 2 concurrency
#   bash stress/bin/run-all.sh --full         # FAZA >=3 stub — not implemented
#   bash stress/bin/run-all.sh --keep-stack   # don't tear down on exit
#
# Faza 1 = skeleton (guard/start/reset/pause-cron/seed/tokens).
# Faza 2 = same pipeline, then stress/invariants/run-all.sh (6 concurrency
#          scenarios + SQL invariant sweep). Latency is report-only.
#
# HARD REQUIREMENT: Supabase CLI must be installed. This orchestrator
# refuses to run without it. The docker-compose.stress.yml file is a
# future artifact (see stress/README.md) and does NOT satisfy this
# requirement — GoTrue + PostgREST are needed for the auth pool step.

set -euo pipefail

MODE="smoke"
LAYER=0
KEEP_STACK=0
for arg in "$@"; do
  case "$arg" in
    --smoke) MODE="smoke" ;;
    --full)  MODE="full" ;;
    --layer=2) LAYER=2; MODE="smoke" ;;
    --keep-stack) KEEP_STACK=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [[ "$MODE" == "full" ]]; then
  echo "run-all: --full is a stub for Faza >=3. Supported: --smoke, --layer=2." >&2
  exit 2
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "run-all: Supabase CLI not found on PATH." >&2
  echo "run-all: Faza 1 REQUIRES the full local Supabase stack (Postgres + GoTrue + PostgREST)." >&2
  echo "run-all: install it — https://supabase.com/docs/guides/local-development — then retry." >&2
  echo "run-all: docker-compose.stress.yml is NOT a valid fallback (Postgres-only, no auth)." >&2
  exit 1
fi

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
  if [[ "$KEEP_STACK" -eq 0 ]]; then
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
supabase start 2>&1 | tail -20

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
