#!/usr/bin/env bash
# Layer 2 orchestrator — runs the 6 concurrency scenarios in order, then the
# SQL invariant sweep. First failure hard-stops the run (set -e).
#
# Preconditions (owned by stress/bin/run-all.sh --layer=2):
#   - Local Supabase stack running
#   - Cron paused
#   - Faza 1 smoke seed applied
#   - stress/reports/tokens.json populated
#   - STRESS_SUPABASE_URL / _ANON_KEY / _SERVICE_ROLE_KEY / _DB_URL exported
#
# Latency in scenario output is REPORT-ONLY. Fail = thrown invariant.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STRESS="$ROOT/stress"

: "${STRESS_SUPABASE_URL:?missing}"
: "${STRESS_SUPABASE_ANON_KEY:?missing}"
: "${STRESS_SUPABASE_SERVICE_ROLE_KEY:?missing}"
: "${STRESS_SUPABASE_DB_URL:?missing}"

echo "--- Layer 2 preflight: cron pause check ---"
psql "$STRESS_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -tAc "
DO \$\$
DECLARE n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name='cron') THEN
    RAISE NOTICE 'no pg_cron — skip';
    RETURN;
  END IF;
  SELECT count(*) INTO n FROM cron.job WHERE active = true;
  IF n > 0 THEN RAISE EXCEPTION 'preflight: % active cron jobs (must be 0)', n; END IF;
END\$\$;
"
echo "  cron paused: OK"

echo ""
echo "--- Layer 2 scenarios ---"
cd "$STRESS"

SCENARIOS=(
  "layer2-concurrency/01_same_source_writes.ts"
  "layer2-concurrency/02_anchor_race.ts"
  "layer2-concurrency/03_krug_double_approve.ts"
  "layer2-concurrency/04_approve_vs_retract.ts"
  "layer2-concurrency/05_share_unshare_race.ts"
  "layer2-concurrency/06_payout_storno_race.ts"
)

for s in "${SCENARIOS[@]}"; do
  bun run "$s"
done

echo ""
echo "--- Layer 2 invariant sweep (SQL) ---"
psql "$STRESS_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$STRESS/invariants/krug.sql"

echo ""
echo "Layer 2: OK"
