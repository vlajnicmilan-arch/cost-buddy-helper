#!/usr/bin/env bash
# Stress harness orchestrator — Faza 1.
#
# Usage:
#   bash stress/bin/run-all.sh --smoke        # small seed, quick validation
#   bash stress/bin/run-all.sh --full         # FAZA 2 stub — not implemented
#   bash stress/bin/run-all.sh --keep-stack   # don't tear down on exit
#
# Faza 1 does NOT run any concurrency/k6/UI tests — it only proves the
# skeleton stands up end-to-end and prints READY.
#
# HARD REQUIREMENT: Supabase CLI must be installed. This orchestrator
# refuses to run without it. The docker-compose.stress.yml file is a
# future artifact (see stress/README.md) and does NOT satisfy this
# requirement — GoTrue + PostgREST are needed for the auth pool step.

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

if [[ "$MODE" == "full" ]]; then
  echo "run-all: --full is a Faza 2 stub. Faza 1 supports --smoke only." >&2
  echo "run-all: seed/seed.ts full branch is not runtime-verified; refusing to run." >&2
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
echo "=== 2b/7 preinstall cron/net extensions (bootstrap shim) ==="
# Root cause: migration 20260604210824 (and siblings 20260320/20260327/20260513)
# call CREATE EXTENSION pg_cron. On this local Supabase stack the role that
# `supabase db reset --local` uses to execute migrations cannot load the
# pg_cron control file via pg_read_file (needs pg_read_server_files /
# superuser). We pre-install pg_cron + pg_net once here as the postgres
# superuser (via the direct DB URL from `supabase status`) so every
# `CREATE EXTENSION IF NOT EXISTS pg_cron` in the chain becomes a true no-op
# and never re-triggers pg_read_file.
#
# History-safe: we do NOT rewrite any historical migration. Named cron jobs
# (`krug-expire-predlozena`, `krug-cleanup-act-dedup`) remain scheduled by
# their original migration exactly as in production.
#
# Production is unaffected: extensions already exist there, and this shim
# only runs under the stress harness against a localhost URL guarded by
# guard-env.sh. `supabase db reset --local` preserves the `extensions`
# schema and its installed extensions, so the pre-install survives reset.
psql "$STRESS_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
SQL

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
