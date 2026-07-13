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
    --layer=1) LAYER=1; MODE="layer1" ;;
    --layer=2) LAYER=2; MODE="smoke" ;;
    --keep-stack) KEEP_STACK=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [[ "$MODE" == "full" ]]; then
  echo "run-all: --full is a stub for Faza >=3. Supported: --smoke, --layer=1, --layer=2." >&2
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

# --------------------------------------------------------------------------
# Self-reporting on failure (no workflow edit needed).
# 1) Tee full stdout+stderr into stress/reports/stress-output.log so the
#    existing `stress-reports` artifact carries the log for humans.
# 2) On non-zero exit, emit GitHub Actions workflow-commands on stdout so
#    the failing tail is visible on the run page as annotations.
# GitHub caps annotations per step at 10; we grouped context lines using
# URL-encoded newlines (%0A) so a single ::error:: can carry multiple lines.
# tee never masks the real exit code because we use `exec > >(tee ...)` —
# the original process's exit status propagates unchanged.
# --------------------------------------------------------------------------
mkdir -p "$STRESS/reports"
STRESS_OUTPUT_LOG="$STRESS/reports/stress-output.log"
: > "$STRESS_OUTPUT_LOG"
exec > >(tee -a "$STRESS_OUTPUT_LOG") 2>&1

emit_failure_annotations() {
  local log="$STRESS_OUTPUT_LOG"
  [[ -s "$log" ]] || return 0

  # Best-effort "root cause" line: first FAIL/ERROR/exception hit; fall back
  # to the last non-empty line of the log.
  local fail_line
  fail_line="$(grep -E -m1 -i \
    -e '^FAIL' \
    -e ' FAIL ' \
    -e 'ERROR:' \
    -e 'error:' \
    -e 'exception' \
    -e 'permission denied' \
    -e 'could not find' \
    -e 'violated' \
    "$log" || true)"
  if [[ -z "$fail_line" ]]; then
    fail_line="$(grep -v '^[[:space:]]*$' "$log" | tail -n 1 || true)"
  fi
  # Strip control chars and trim to keep the annotation title readable.
  fail_line="$(printf '%s' "$fail_line" | tr -d '\r' | cut -c1-300)"
  printf '::error title=STRESS FAIL::%s\n' "${fail_line:-<no log lines captured>}"

  # Emit last ~12 lines of context, grouped 3 per annotation (=> 4 annotations,
  # well under GitHub's 10-per-step cap alongside the title above).
  local tmp
  tmp="$(mktemp)"
  tail -n 12 "$log" | tr -d '\r' > "$tmp"
  local group=""
  local n=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ -z "$group" ]]; then
      group="$line"
    else
      group="${group}%0A${line}"
    fi
    n=$((n+1))
    if (( n % 3 == 0 )); then
      printf '::error::%s\n' "$group"
      group=""
    fi
  done < "$tmp"
  if [[ -n "$group" ]]; then
    printf '::error::%s\n' "$group"
  fi
  rm -f "$tmp"
}

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
  if (( ec != 0 )); then
    emit_failure_annotations || true
  fi
  exit "$ec"
}
trap cleanup EXIT INT TERM


echo "=== 1/7 guard-env ==="
bash "$STRESS/bin/guard-env.sh"

# Load env for the rest of the run
# shellcheck disable=SC1090
set -a; source "$STRESS_ENV_FILE"; set +a
# Re-assert MODE after sourcing (.env pins STRESS_SEED_MODE=smoke; layer=1 needs 'layer1').
export STRESS_SEED_MODE="$MODE"


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
if [[ "$LAYER" -eq 1 ]]; then
  echo "next phase:    layer1-load (running now, PROFILE=${PROFILE:-small})"
elif [[ "$LAYER" -eq 2 ]]; then
  echo "next phase:    layer2-concurrency (running now)"
else
  echo "next phase:    layerX (skipped — pass --layer=1 or --layer=2)"
fi
echo ""
echo "READY"

if [[ "$LAYER" -eq 2 ]]; then
  echo ""
  echo "=== Layer 2 (concurrency) ==="
  cd "$ROOT"
  bash "$STRESS/invariants/run-all.sh"
fi

if [[ "$LAYER" -eq 1 ]]; then
  echo ""
  echo "=== Layer 1 (k6 mixed load) ==="
  if ! command -v k6 >/dev/null 2>&1; then
    echo "run-all: k6 not installed — abort" >&2
    exit 1
  fi
  PROFILE_EFF="${PROFILE:-small}"
  echo "  profile: $PROFILE_EFF"
  cd "$ROOT"
  # k6 needs Supabase env exposed to script.
  STRESS_SUPABASE_URL="$STRESS_SUPABASE_URL" \
  STRESS_SUPABASE_ANON_KEY="$STRESS_SUPABASE_ANON_KEY" \
  PROFILE="$PROFILE_EFF" \
    k6 run "$STRESS/layer1-load/mixed_load.js"

  echo ""
  echo "=== Layer 1 invariant sweep (krug.sql + layer1.sql) ==="
  # krug.sql is harmless PASS on untouched layer2 fixtures — kept in chain per mandate.
  psql "$STRESS_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$STRESS/invariants/krug.sql"

  INSERT_OK=0
  if [[ -f "$STRESS/reports/k6-summary.json" ]]; then
    INSERT_OK="$(bun -e 'const j=JSON.parse(require("fs").readFileSync("stress/reports/k6-summary.json","utf8"));console.log(j.counters.expense_insert_ok||0)')"
  fi
  echo "  layer1 insert_ok from k6 summary: $INSERT_OK"
  psql "$STRESS_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
    -v layer1_insert_ok="$INSERT_OK" \
    -f "$STRESS/invariants/layer1.sql"

  echo ""
  echo "Layer 1: OK"
fi

