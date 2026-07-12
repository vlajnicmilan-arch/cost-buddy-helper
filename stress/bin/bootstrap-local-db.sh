#!/usr/bin/env bash
# Start or reset the local Supabase DB with pg_cron/pg_net installed before
# the application migration chain is replayed.
#
# Instrumented with explicit PHASE markers so the CI log unambiguously shows
# whether:
#   A. `supabase start` still replays migrations before bootstrap (order bug)
#   B. bootstrap succeeds but `supabase migration up` re-fails on
#      `CREATE EXTENSION IF NOT EXISTS pg_cron` (privilege mechanics)
set -euo pipefail

MODE="${1:-}"
case "$MODE" in
  start|reset) ;;
  *) echo "usage: $0 start|reset" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONFIG="$ROOT/supabase/config.toml"
CONFIG_BACKUP="$(mktemp)"
MIGRATIONS_DIR="$ROOT/supabase/migrations"
MIGRATIONS_BACKUP="$ROOT/supabase/migrations.stress-original"
CONFIG_RESTORED=0
MIGRATIONS_RESTORED=1  # flips to 0 only after we swap them

log() { printf '\n[bootstrap] %s\n' "$*"; }

cp "$CONFIG" "$CONFIG_BACKUP"

restore_config() {
  if [[ "$CONFIG_RESTORED" -eq 0 ]]; then
    cp "$CONFIG_BACKUP" "$CONFIG"
    CONFIG_RESTORED=1
  fi
  rm -f "$CONFIG_BACKUP"
}

restore_migrations() {
  if [[ "$MIGRATIONS_RESTORED" -eq 0 && -d "$MIGRATIONS_BACKUP" ]]; then
    rm -rf "$MIGRATIONS_DIR"
    mv "$MIGRATIONS_BACKUP" "$MIGRATIONS_DIR"
    MIGRATIONS_RESTORED=1
    log "restored original supabase/migrations from backup"
  fi
}

cleanup_all() {
  restore_config
  restore_migrations
}
trap cleanup_all EXIT INT TERM

disable_local_replay() {
  python3 - "$CONFIG" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
text = path.read_text()

def disable_section(text: str, section_name: str) -> str:
    section = re.search(rf'(?ms)^\[{re.escape(section_name)}\]\n(?P<body>.*?)(?=^\[[^\n]+\]|\Z)', text)
    if section:
        body = section.group('body')
        if re.search(r'(?m)^enabled\s*=', body):
            body = re.sub(r'(?m)^enabled\s*=.*$', 'enabled = false', body, count=1)
        else:
            body = 'enabled = false\n' + body
        return text[:section.start('body')] + body + text[section.end('body'):]

    db_section = re.search(r'(?m)^\[db\]\n', text)
    if not db_section:
        raise SystemExit('supabase/config.toml is missing [db] section')
    next_section = re.search(r'(?m)^\[[^\n]+\]\n', text[db_section.end():])
    insert_at = db_section.end() + next_section.start() if next_section else len(text)
    block = f'\n[{section_name}]\nenabled = false\n'
    return text[:insert_at].rstrip() + '\n' + block + text[insert_at:]

text = disable_section(text, 'db.migrations')
text = disable_section(text, 'db.seed')

path.write_text(text)
PY
  log "config.toml after disable (db.* sections):"
  awk '/^\[db(\.|])/{p=1} p{print; if(/^$/)p=0}' "$CONFIG" | sed 's/^/    /'
}

resolve_db_url() {
  eval "$(supabase status --output env)"
  : "${DB_URL:?supabase status did not expose DB_URL}"
  echo "$DB_URL"
}

bootstrap_extensions() {
  local url="$1"
  psql "$url" -v ON_ERROR_STOP=1 -f "$ROOT/stress/bin/bootstrap-cron-extensions.sql"
}

verify_extensions() {
  local url="$1"
  local label="$2"
  log "PHASE verify ($label) — context + extension state"
  psql "$url" -v ON_ERROR_STOP=1 -X -A -F' | ' <<'SQL'
SELECT 'db=' || current_database()
    || ' user=' || current_user
    || ' search_path=' || current_setting('search_path') AS context;
SELECT extname, extnamespace::regnamespace AS schema, extversion
FROM pg_extension
WHERE extname IN ('pg_cron','pg_net')
ORDER BY extname;
SELECT 'count_required=' || COUNT(*) AS check
FROM pg_extension
WHERE extname IN ('pg_cron','pg_net');
SQL
  # Hard gate: refuse to proceed if either extension is missing.
  local count
  count=$(psql "$url" -X -A -t -c "SELECT COUNT(*) FROM pg_extension WHERE extname IN ('pg_cron','pg_net');")
  if [[ "${count//[[:space:]]/}" != "2" ]]; then
    echo "[bootstrap] FATAL: expected pg_cron + pg_net present, got count=$count" >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------
log "PHASE 1 disable_local_replay"
disable_local_replay

log "PHASE 2 supabase ${MODE}  (migrations should be disabled at this point)"
# IMPORTANT: do NOT let this kill the script. We must always reach PHASE 2b
# so we can prove A (start replayed migrations) vs B (privilege problem later).
set +e
if [[ "$MODE" == "start" ]]; then
  supabase start
  START_EC=$?
else
  supabase db reset --local --no-seed
  START_EC=$?
fi
set -e
log "PHASE 2 exit code: START_EC=${START_EC}"

# Try to resolve DB_URL, but don't die if supabase status fails — fall back
# to the well-known local default so PHASE 2b diagnostics still run.
set +e
DB_URL_VAL="$(resolve_db_url 2>/dev/null)"
RESOLVE_EC=$?
set -e
if [[ $RESOLVE_EC -ne 0 || -z "${DB_URL_VAL:-}" ]]; then
  DB_URL_VAL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
  log "resolve_db_url failed (ec=${RESOLVE_EC}); falling back to default local DB_URL"
fi
log "resolved DB_URL host suffix: ...${DB_URL_VAL: -40}"

# PHASE 2b MUST run even if PHASE 2 failed. This is the whole point of the
# diagnostic pass: we need proof of whether supabase start already replayed
# the migration chain (truth A) or not (truth B).
log "PHASE 2b post-start snapshot (pre-bootstrap) — runs regardless of START_EC"
set +e
psql "$DB_URL_VAL" -X -A -F' | ' <<'SQL'
SELECT 'context' AS marker,
       'db=' || current_database()
    || ' user=' || current_user
    || ' search_path=' || current_setting('search_path') AS value;
SELECT 'pre_bootstrap_extensions' AS marker,
       COALESCE(string_agg(extname, ','), '<none>') AS present
FROM pg_extension
WHERE extname IN ('pg_cron','pg_net');
SELECT 'pre_bootstrap_migrations_applied' AS marker,
       COUNT(*)::text AS n
FROM supabase_migrations.schema_migrations;
SQL
SNAP_EC=$?
set -e
log "PHASE 2b snapshot exit code: SNAP_EC=${SNAP_EC}"

# Now interpret. If PHASE 2 failed, stop here with a clear verdict; do not
# proceed to bootstrap because the stack is in an inconsistent state and
# further steps would only muddy the log.
if [[ $START_EC -ne 0 ]]; then
  log "VERDICT: PHASE 2 failed (START_EC=${START_EC})."
  log "  → If pre_bootstrap_migrations_applied > 0 OR pg_cron/pg_net already present:"
  log "    supabase start replayed migrations BEFORE our bootstrap = TRUTH A (order bug)."
  log "  → If snapshot itself failed (SNAP_EC != 0) and DB is not reachable:"
  log "    supabase start never brought DB up; investigate CLI-level failure."
  exit "$START_EC"
fi


log "PHASE 3 bootstrap_extensions"
bootstrap_extensions "$DB_URL_VAL"

verify_extensions "$DB_URL_VAL" "after-bootstrap"

restore_config

log "PHASE 4 neutralize CREATE EXTENSION pg_cron/pg_net in a HARNESS-ONLY temp copy of supabase/migrations"
# Root-cause TRUTH B: historical `CREATE EXTENSION IF NOT EXISTS pg_cron`
# statements fail during local replay by privilege mechanics, even though
# the extension is already present after PHASE 3. We MUST NOT edit files
# in supabase/migrations/ in the repo — production replay must remain
# identical. Instead: back up the real dir, replace it with a neutralized
# copy for the duration of `supabase migration up`, and restore on exit
# (trap cleanup_all).
if [[ ! -d "$MIGRATIONS_BACKUP" ]]; then
  mv "$MIGRATIONS_DIR" "$MIGRATIONS_BACKUP"
  cp -R "$MIGRATIONS_BACKUP" "$MIGRATIONS_DIR"
  MIGRATIONS_RESTORED=0
  log "swapped supabase/migrations -> harness-only copy (original saved as supabase/migrations.stress-original)"
else
  log "WARN: migrations backup already exists; refusing to overwrite" >&2
  exit 1
fi

# Neutralize only pg_cron / pg_net CREATE EXTENSION statements. Everything
# else — including cron job scheduling, Wave 1.5 job names, DO $$ wrappers
# — is preserved. Extensions themselves are already installed by PHASE 3.
NEUTRALIZED_COUNT=0
while IFS= read -r -d '' f; do
  if grep -Eqi 'CREATE[[:space:]]+EXTENSION[^;]*\bpg_(cron|net)\b' "$f"; then
    # Replace matching CREATE EXTENSION line(s) with a no-op SELECT.
    # Handles: `CREATE EXTENSION IF NOT EXISTS pg_cron;`,
    #          `CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;`,
    #          `    CREATE EXTENSION pg_cron;` (inside DO $$ ... END $$).
    python3 - "$f" <<'PY'
import re, sys
p = sys.argv[1]
src = open(p).read()
pat = re.compile(
    r'(?im)^([ \t]*)CREATE[ \t]+EXTENSION\b[^;]*\bpg_(?:cron|net)\b[^;]*;',
)
new = pat.sub(r"\1SELECT 1; -- stress-harness: pg_cron/pg_net neutralized (installed via bootstrap)", src)
if new != src:
    open(p, 'w').write(new)
PY
    NEUTRALIZED_COUNT=$((NEUTRALIZED_COUNT + 1))
    log "neutralized: $(basename "$f")"
  fi
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' -print0)
log "PHASE 4 neutralized ${NEUTRALIZED_COUNT} migration file(s)"

# Sanity: no CREATE EXTENSION pg_cron/pg_net should remain in the harness copy.
if grep -REil 'CREATE[[:space:]]+EXTENSION[^;]*\bpg_(cron|net)\b' "$MIGRATIONS_DIR" >/dev/null; then
  log "FATAL: neutralization left residual CREATE EXTENSION pg_cron/pg_net statements" >&2
  grep -REn 'CREATE[[:space:]]+EXTENSION[^;]*\bpg_(cron|net)\b' "$MIGRATIONS_DIR" >&2 || true
  exit 1
fi

log "PHASE 4b neutralize DROP FUNCTION is_project_manager in historical 034641 (harness-only)"
# Migration 20260609034641 does DROP FUNCTION IF EXISTS
# public.is_project_manager(uuid,uuid) but two policies on public.expenses
# ("Users can update their own expenses", "Users can delete their own expenses")
# still reference it, so clean replay fails with SQLSTATE 2BP01. The forward
# migration 20260712*_expenses_drop_is_project_manager.sql drops those
# policies (recreates them with is_project_owner) and then drops the function.
# Here we only neutralize the premature DROP in 034641 so replay reaches the
# new migration. HARNESS-ONLY: production `supabase db push` untouched.
F034641=$(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '20260609034641_*.sql' | head -1)
if [[ -n "$F034641" && -f "$F034641" ]]; then
  python3 - "$F034641" <<'PY2'
import re, sys
p = sys.argv[1]
src = open(p).read()
pat = re.compile(
    r'(?im)^([ \t]*)DROP[ \t]+FUNCTION[ \t]+IF[ \t]+EXISTS[ \t]+public\.is_project_manager\s*\([^)]*\)\s*;',
)
new = pat.sub(
    r"\1SELECT 1; -- stress-harness: DROP FUNCTION public.is_project_manager moved to forward migration",
    src,
)
if new != src:
    open(p, 'w').write(new)
    print("neutralized DROP FUNCTION is_project_manager in", p)
else:
    print("WARN: no match for DROP FUNCTION is_project_manager in", p)
PY2
else
  echo "[bootstrap] WARN: could not locate 20260609034641_*.sql in harness copy" >&2
fi

log "PHASE 5 supabase migration up --include-all (against neutralized harness copy)"
supabase migration up --include-all
verify_extensions "$DB_URL_VAL" "after-migration-up"

log "PHASE 6 restore original supabase/migrations"
restore_migrations
trap - EXIT INT TERM

log "PHASE 7 done"
