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
RESTORED=0

log() { printf '\n[bootstrap] %s\n' "$*"; }

cp "$CONFIG" "$CONFIG_BACKUP"

restore_config() {
  if [[ "$RESTORED" -eq 0 ]]; then
    cp "$CONFIG_BACKUP" "$CONFIG"
    RESTORED=1
  fi
  rm -f "$CONFIG_BACKUP"
}
trap restore_config EXIT INT TERM

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
if [[ "$MODE" == "start" ]]; then
  supabase start
else
  supabase db reset --local --no-seed
fi

DB_URL_VAL="$(resolve_db_url)"
log "resolved DB_URL host suffix: ...${DB_URL_VAL: -40}"

# If disable_local_replay actually worked, pg_cron must NOT exist yet.
# If it DOES exist here, that means supabase start ignored our config toggle
# and already ran the migration chain (which itself would have failed on
# pg_read_file). Either way, this snapshot proves the ordering.
log "PHASE 2b post-start snapshot (pre-bootstrap)"
psql "$DB_URL_VAL" -v ON_ERROR_STOP=1 -X -A -F' | ' <<'SQL'
SELECT 'pre_bootstrap_extensions' AS marker,
       COALESCE(string_agg(extname, ','), '<none>') AS present
FROM pg_extension
WHERE extname IN ('pg_cron','pg_net');
SELECT 'pre_bootstrap_migrations_applied' AS marker,
       COUNT(*)::text AS n
FROM supabase_migrations.schema_migrations;
SQL

log "PHASE 3 bootstrap_extensions"
bootstrap_extensions "$DB_URL_VAL"

verify_extensions "$DB_URL_VAL" "after-bootstrap"

restore_config
trap - EXIT INT TERM

log "PHASE 5 supabase migration up --include-all"
# Rerun verification AFTER migration up so we can distinguish:
#   - Failure DURING migration up on CREATE EXTENSION  => truth B
#   - Success here                                     => truth A was the story
supabase migration up --include-all
verify_extensions "$DB_URL_VAL" "after-migration-up"
log "PHASE 6 done"
