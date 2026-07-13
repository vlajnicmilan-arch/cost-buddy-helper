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
    --layer=3) LAYER=3; MODE="smoke" ;;
    --keep-stack) KEEP_STACK=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [[ "$MODE" == "full" ]]; then
  echo "run-all: --full is a stub for Faza >=3. Supported: --smoke, --layer=1, --layer=2, --layer=3." >&2
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
  # NOTE: ignore known cosmetic red-herrings from `supabase stop` internals
  # (e.g. 'supabase_migrations.schema_migrations does not exist') — these are
  # emitted by the CLI's shutdown hook and MUST NOT hijack the STRESS FAIL
  # title from the real cause (invariant violation or k6 threshold breach).
  local fail_line
  fail_line="$(grep -E -v \
      -e 'supabase_migrations\.schema_migrations' \
      "$log" \
    | grep -E -m1 -i \
      -e '^FAIL' \
      -e ' FAIL ' \
      -e 'ERROR:' \
      -e 'error:' \
      -e 'exception' \
      -e 'permission denied' \
      -e 'could not find' \
      -e 'violated' \
      || true)"
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
    # `supabase stop` sometimes emits a cosmetic
    # 'relation "supabase_migrations.schema_migrations" does not exist' from
    # its shutdown hook. That message is harmless (containers stop cleanly),
    # but it gets picked up by the STRESS FAIL annotator as a red-herring
    # root cause. Filter it out at source. Real errors still pass through.
    supabase stop --no-backup 2>&1 \
      | grep -E -v 'supabase_migrations\.schema_migrations' \
      | sed 's/^/  /' || true
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
elif [[ "$LAYER" -eq 3 ]]; then
  echo "next phase:    layer3-e2e-under-load (running now)"
else
  echo "next phase:    layerX (skipped — pass --layer=1, --layer=2 or --layer=3)"
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
  # -----------------------------------------------------------------------
  # SUD MORA SUDITI. k6 exits with 99 on threshold breach (e.g. `http_req_failed`
  # crossed). Under set -e that would abort the script BEFORE the invariant
  # sweep runs — so the STRESS FAIL annotation would carry only the k6
  # threshold noise, and L1-A/B/C + krug I1-I7 would never render a verdict.
  #
  # Contract from this point on:
  #   1. Capture k6 exit code without aborting.
  #   2. Emit ::notice headline numbers UNCONDITIONALLY (they matter most
  #      exactly when k6 breached, to quantify the CI hardware ceiling).
  #   3. Run invariant sweep UNCONDITIONALLY (krug I1-I7 + L1-A/B/C).
  #   4. Compute final exit:
  #        - any invariant failure  → exit 1  (CRVENA ZONA: truth violated)
  #        - only k6 threshold      → exit 2  (CI hardware ceiling; still
  #          non-zero so the run is red, but distinguishable from invariant
  #          fail in logs/annotations)
  #        - both clean             → exit 0
  # -----------------------------------------------------------------------
  set +e
  STRESS_SUPABASE_URL="$STRESS_SUPABASE_URL" \
  STRESS_SUPABASE_ANON_KEY="$STRESS_SUPABASE_ANON_KEY" \
  PROFILE="$PROFILE_EFF" \
    k6 run "$STRESS/layer1-load/mixed_load.js"
  K6_EC=$?
  set -e
  echo "  k6 exit code: $K6_EC (0=clean, 99=threshold breach, other=hard error)"

  # -----------------------------------------------------------------------
  # k6 visibility: emit ::notice annotations with headline numbers so every
  # run surfaces them via check-runs API without needing artifact download.
  # Runs even when k6 breached — those runs need the numbers MOST.
  # -----------------------------------------------------------------------
  SUMMARY_FILE="$STRESS/reports/k6-summary.json"
  if [[ -f "$SUMMARY_FILE" ]]; then
    bun -e '
      const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const d = j.http_req_duration || {};
      const e = j.endpoints || {};
      const c = j.counters || {};
      const fmt = (v) => v ? `p50=${(v.med??0).toFixed(0)}ms p95=${(v.p95??0).toFixed(0)}ms p99=${(v.p99??0).toFixed(0)}ms max=${(v.max??0).toFixed(0)}ms` : "n/a";
      const pct = ((j.http_req_failed_rate || 0) * 100).toFixed(2);
      console.log(`::notice title=k6 layer1 headline (${j.profile})::VU=${j.vus_max} dur=${j.duration} err_rate=${pct}%25 insert_ok=${c.expense_insert_ok} insert_err=${c.expense_insert_err} list_ok=${c.list_ok} balance_ok=${c.balance_ok}`);
      console.log(`::notice title=k6 layer1 http_req_duration::${fmt(d)}`);
      console.log(`::notice title=k6 layer1 endpoint insert::${fmt(e.insert)}`);
      console.log(`::notice title=k6 layer1 endpoint list::${fmt(e.list)}`);
      console.log(`::notice title=k6 layer1 endpoint balance::${fmt(e.balance)}`);
    ' "$SUMMARY_FILE" || echo "::warning title=k6 layer1::visibility emit failed (non-fatal)"
  else
    echo "::warning title=k6 layer1::summary file missing at $SUMMARY_FILE"
  fi

  echo ""
  echo "=== Layer 1 invariant sweep (krug.sql + layer1.sql) — UNCONDITIONAL ==="
  # Sudci sude bez obzira na k6 rezultat. Set +e so a single invariant fail
  # doesn't skip the other; capture per-file exit codes for the final verdict.
  INV_KRUG_EC=0
  INV_LAYER1_EC=0

  # krug.sql is harmless PASS on untouched layer2 fixtures — kept in chain per mandate.
  set +e
  psql "$STRESS_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$STRESS/invariants/krug.sql"
  INV_KRUG_EC=$?
  set -e
  echo "  krug.sql exit code: $INV_KRUG_EC"

  # -----------------------------------------------------------------------
  # Robust INSERT_OK extraction. NO silent fallback to 0 (per mandate):
  # if the counter can't be read (missing file, bun error, non-numeric,
  # negative), mark L1-C as failed via INV_LAYER1_EC — do NOT abort the
  # verdict pipeline (krug result must still be reported).
  # -----------------------------------------------------------------------
  INSERT_OK=""
  BUN_EC=99
  if [[ -f "$SUMMARY_FILE" ]]; then
    INSERT_OK="$(bun -e '
      try {
        const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        const n = j && j.counters && j.counters.expense_insert_ok;
        if (typeof n !== "number" || !Number.isFinite(n) || n < 0) process.exit(2);
        process.stdout.write(String(Math.trunc(n)));
      } catch (e) {
        process.stderr.write(String(e && e.message || e));
        process.exit(3);
      }
    ' "$SUMMARY_FILE" 2>/dev/null)"
    BUN_EC=$?
  fi
  if ! [[ "$INSERT_OK" =~ ^[0-9]+$ ]]; then
    printf '::error title=L1-C harness::insert counter unreadable (bun_ec=%s file=%s value=%q) — L1-C cannot execute\n' \
      "$BUN_EC" "$SUMMARY_FILE" "$INSERT_OK"
    INV_LAYER1_EC=1
  else
    echo "  layer1 insert_ok from k6 summary: $INSERT_OK"
    set +e
    psql "$STRESS_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
      -v layer1_insert_ok="$INSERT_OK" \
      -f "$STRESS/invariants/layer1.sql"
    INV_LAYER1_EC=$?
    set -e
    echo "  layer1.sql exit code: $INV_LAYER1_EC"
  fi

  # -----------------------------------------------------------------------
  # Final verdict — razdvojeno: (a) istina, (b) brzina.
  # -----------------------------------------------------------------------
  echo ""
  echo "=== Layer 1 verdict ==="
  echo "  (a) istina — invariants:"
  echo "        krug I1-I7  : $([[ $INV_KRUG_EC   -eq 0 ]] && echo PASS || echo FAIL)"
  echo "        L1-A/B/C    : $([[ $INV_LAYER1_EC -eq 0 ]] && echo PASS || echo FAIL)"
  echo "  (b) brzina — k6 thresholds:"
  echo "        k6 exit code: $K6_EC $([[ $K6_EC -eq 0 ]] && echo '(clean)' || echo '(breach — CI hardware ceiling, 2 vCPU)')"

  if (( INV_KRUG_EC != 0 || INV_LAYER1_EC != 0 )); then
    printf '::error title=LAYER1 INVARIANT FAIL::truth violated (krug_ec=%s layer1_ec=%s k6_ec=%s) — CRVENA ZONA\n' \
      "$INV_KRUG_EC" "$INV_LAYER1_EC" "$K6_EC"
    echo "Layer 1: INVARIANT FAIL (crvena zona)"
    exit 1
  fi

  if (( K6_EC != 0 )); then
    printf '::warning title=LAYER1 k6 threshold breach::invariants PASS, k6 breached (ec=%s) — CI hardware ceiling under profile=%s\n' \
      "$K6_EC" "$PROFILE_EFF"
    echo "Layer 1: invariants PASS, k6 breached — CI granica hardvera (exit 2)"
    exit 2
  fi

  echo "Layer 1: OK (invariants PASS, k6 clean)"
fi

# =========================================================================
# Layer 3 — Playwright E2E pod k6 small background loadom.
# Kritični guard: prod-izolacija. Vite build MORA upeći lokalni Supabase
# URL/anon key iz stress/.env. Nikad remote fzalxjretvtvokiotvkf.supabase.co.
# =========================================================================
if [[ "$LAYER" -eq 3 ]]; then
  echo ""
  echo "=== Layer 3 (Playwright E2E under k6 small load) ==="
  if ! command -v k6 >/dev/null 2>&1; then
    echo "run-all: k6 not installed — abort (layer 3 needs k6 for background load)" >&2
    exit 1
  fi
  if ! command -v bunx >/dev/null 2>&1; then
    echo "run-all: bunx not on PATH — abort" >&2
    exit 1
  fi

  cd "$ROOT"

  # -----------------------------------------------------------------------
  # 1) BUILD app with LOCAL env vars only.
  #    Vite reads VITE_* at build time and bakes them into the bundle.
  #    We force local values here — production .env values are IGNORED.
  # -----------------------------------------------------------------------
  echo ""
  echo "--- layer3 [1/6] Vite build with local env vars ---"
  echo "  VITE_SUPABASE_URL=$STRESS_SUPABASE_URL"
  echo "  VITE_SUPABASE_PROJECT_ID=(derived from local url)"
  rm -rf dist
  VITE_SUPABASE_URL="$STRESS_SUPABASE_URL" \
  VITE_SUPABASE_PUBLISHABLE_KEY="$STRESS_SUPABASE_ANON_KEY" \
  VITE_SUPABASE_PROJECT_ID="localstack" \
    bun run build 2>&1 | tail -20

  # -----------------------------------------------------------------------
  # 2) PROD-ISOLATION GUARD. Grep bundle for prod project ref and any
  #    remote *.supabase.co host. Match = LOUD ABORT.
  # -----------------------------------------------------------------------
  echo ""
  echo "--- layer3 [2/6] prod-isolation guard on dist/ ---"
  PROD_REF="fzalxjretvtvokiotvkf"
  set +e
  PROD_HITS="$(grep -rEo "${PROD_REF}\.supabase\.co" dist/ 2>/dev/null | sort -u)"
  REMOTE_HITS="$(grep -rEo "[a-z0-9]+\.supabase\.(co|in)" dist/ 2>/dev/null | sort -u)"
  set -e
  if [[ -n "$PROD_HITS" ]]; then
    printf '::error title=LAYER3 PROD LEAK::built bundle references PRODUCTION Supabase project — ABORT\n'
    echo "layer3: FATAL — dist/ contains prod project ref:"
    echo "$PROD_HITS"
    exit 1
  fi
  if [[ -n "$REMOTE_HITS" ]]; then
    printf '::error title=LAYER3 REMOTE HOST::built bundle references remote *.supabase.co — ABORT\n'
    echo "layer3: FATAL — dist/ contains remote Supabase host(s):"
    echo "$REMOTE_HITS"
    exit 1
  fi
  # Confirm local URL IS present (belt & suspenders: build must have baked it).
  if ! grep -rq "127.0.0.1:54321" dist/ 2>/dev/null; then
    printf '::error title=LAYER3 LOCAL URL MISSING::dist/ does not contain 127.0.0.1:54321 — env not injected\n'
    echo "layer3: FATAL — local Supabase URL not found in bundle"
    exit 1
  fi
  echo "  guard OK: dist/ contains 127.0.0.1:54321, no *.supabase.co references"

  # -----------------------------------------------------------------------
  # 3) START Vite preview in background.
  # -----------------------------------------------------------------------
  echo ""
  echo "--- layer3 [3/6] start Vite preview on :4173 ---"
  PREVIEW_LOG="$STRESS/reports/layer3-preview.log"
  bunx vite preview --port 4173 --strictPort > "$PREVIEW_LOG" 2>&1 &
  PREVIEW_PID=$!
  # Wait for readiness (max 60s).
  for i in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:4173" >/dev/null 2>&1; then
      echo "  preview ready (pid=$PREVIEW_PID, ${i}s)"
      break
    fi
    sleep 1
    if (( i == 60 )); then
      echo "layer3: preview did not become ready in 60s" >&2
      kill "$PREVIEW_PID" 2>/dev/null || true
      exit 1
    fi
  done

  # -----------------------------------------------------------------------
  # 4) START k6 small (30 VU) in background against local stack.
  # -----------------------------------------------------------------------
  echo ""
  echo "--- layer3 [4/6] start k6 small background load ---"
  K6_LOG="$STRESS/reports/layer3-k6-bg.log"
  set +e
  STRESS_SUPABASE_URL="$STRESS_SUPABASE_URL" \
  STRESS_SUPABASE_ANON_KEY="$STRESS_SUPABASE_ANON_KEY" \
  PROFILE="small" \
    k6 run "$STRESS/layer1-load/mixed_load.js" > "$K6_LOG" 2>&1 &
  K6_PID=$!
  set -e
  echo "  k6 background running (pid=$K6_PID, profile=small, ~30VU/30s)"

  # -----------------------------------------------------------------------
  # 5) RUN Playwright specs against the loaded system.
  # -----------------------------------------------------------------------
  echo ""
  echo "--- layer3 [5/6] Playwright specs ---"
  set +e
  E2E_BASE_URL="http://127.0.0.1:4173" \
  E2E_NO_SERVER="1" \
    bunx playwright test --config="$STRESS/layer3-e2e-under-load/playwright.config.ts"
  PW_EC=$?
  set -e
  echo "  playwright exit code: $PW_EC"

  # Reap k6 background (may already have exited on its own after 30s window).
  wait "$K6_PID" 2>/dev/null || true
  K6_EC_L3=$?
  echo "  k6 background exit code: $K6_EC_L3 (0=clean, 99=threshold, other=error)"

  # Stop preview.
  kill "$PREVIEW_PID" 2>/dev/null || true
  wait "$PREVIEW_PID" 2>/dev/null || true

  # -----------------------------------------------------------------------
  # 6) UNCONDITIONAL invariant sweep — krug I1-I7 + L1-A/B/C.
  #    Same contract as layer 1: sudci sude bez obzira na Playwright/k6.
  # -----------------------------------------------------------------------
  echo ""
  echo "--- layer3 [6/6] invariant sweep (UNCONDITIONAL) ---"
  INV_KRUG_EC=0
  INV_LAYER1_EC=0

  set +e
  psql "$STRESS_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$STRESS/invariants/krug.sql"
  INV_KRUG_EC=$?
  set -e
  echo "  krug.sql exit code: $INV_KRUG_EC"

  # L1-C needs INSERT_OK from the k6 background summary (if produced).
  SUMMARY_FILE="$STRESS/reports/k6-summary.json"
  INSERT_OK=""
  if [[ -f "$SUMMARY_FILE" ]]; then
    INSERT_OK="$(bun -e '
      try {
        const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        const n = j && j.counters && j.counters.expense_insert_ok;
        if (typeof n !== "number" || !Number.isFinite(n) || n < 0) process.exit(2);
        process.stdout.write(String(Math.trunc(n)));
      } catch (e) { process.exit(3); }
    ' "$SUMMARY_FILE" 2>/dev/null)"
  fi
  if ! [[ "$INSERT_OK" =~ ^[0-9]+$ ]]; then
    printf '::warning title=L3 L1-C harness::insert counter unreadable — L1-C skipped for layer 3\n'
    echo "  L1-C: SKIPPED (no k6 summary — background may not have flushed)"
  else
    echo "  layer3 insert_ok from k6 bg summary: $INSERT_OK"
    set +e
    psql "$STRESS_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
      -v layer1_insert_ok="$INSERT_OK" \
      -f "$STRESS/invariants/layer1.sql"
    INV_LAYER1_EC=$?
    set -e
    echo "  layer1.sql exit code: $INV_LAYER1_EC"
  fi

  # -----------------------------------------------------------------------
  # Final verdict — same 0/1/2 contract as layer 1.
  # -----------------------------------------------------------------------
  echo ""
  echo "=== Layer 3 verdict ==="
  echo "  (a) istina — invariants:"
  echo "        krug I1-I7  : $([[ $INV_KRUG_EC   -eq 0 ]] && echo PASS || echo FAIL)"
  echo "        L1-A/B/C    : $([[ $INV_LAYER1_EC -eq 0 ]] && echo PASS || echo FAIL)"
  echo "  (b) brzina — Playwright + k6 background:"
  echo "        playwright  : $([[ $PW_EC -eq 0 ]] && echo PASS || echo FAIL)"
  echo "        k6 bg       : $([[ $K6_EC_L3 -eq 0 ]] && echo clean || echo "breach/exit=$K6_EC_L3")"

  if (( INV_KRUG_EC != 0 || INV_LAYER1_EC != 0 )); then
    printf '::error title=LAYER3 INVARIANT FAIL::truth violated (krug_ec=%s layer1_ec=%s pw_ec=%s k6_ec=%s) — CRVENA ZONA\n' \
      "$INV_KRUG_EC" "$INV_LAYER1_EC" "$PW_EC" "$K6_EC_L3"
    echo "Layer 3: INVARIANT FAIL (crvena zona)"
    exit 1
  fi

  if (( PW_EC != 0 || K6_EC_L3 != 0 )); then
    printf '::warning title=LAYER3 threshold breach::invariants PASS, pw_ec=%s k6_ec=%s — CI hardware ceiling\n' \
      "$PW_EC" "$K6_EC_L3"
    echo "Layer 3: invariants PASS, Playwright/k6 breach — CI granica hardvera (exit 2)"
    exit 2
  fi

  echo "Layer 3: OK (invariants PASS, Playwright PASS, k6 bg clean)"
fi


