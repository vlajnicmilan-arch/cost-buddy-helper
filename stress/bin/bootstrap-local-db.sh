#!/usr/bin/env bash
# Start or reset the local Supabase DB with pg_cron/pg_net installed before
# the application migration chain is replayed.
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

cp "$CONFIG" "$CONFIG_BACKUP"

restore_config() {
  if [[ "$RESTORED" -eq 0 ]]; then
    cp "$CONFIG_BACKUP" "$CONFIG"
    RESTORED=1
  fi
  rm -f "$CONFIG_BACKUP"
}
trap restore_config EXIT INT TERM

disable_local_migration_replay() {
  python3 - "$CONFIG" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
text = path.read_text()

section = re.search(r'(?ms)^\[db\.migrations\]\n(?P<body>.*?)(?=^\[[^\n]+\]|\Z)', text)
if section:
    body = section.group('body')
    if re.search(r'(?m)^enabled\s*=', body):
        body = re.sub(r'(?m)^enabled\s*=.*$', 'enabled = false', body, count=1)
    else:
        body = 'enabled = false\n' + body
    text = text[:section.start('body')] + body + text[section.end('body'):]
else:
    db_section = re.search(r'(?m)^\[db\]\n', text)
    if not db_section:
        raise SystemExit('supabase/config.toml is missing [db] section')
    next_section = re.search(r'(?m)^\[[^\n]+\]\n', text[db_section.end():])
    insert_at = db_section.end() + next_section.start() if next_section else len(text)
    block = '\n[db.migrations]\nenabled = false\n'
    text = text[:insert_at].rstrip() + '\n' + block + text[insert_at:]

path.write_text(text)
PY
}

bootstrap_extensions() {
  eval "$(supabase status --output env)"
  : "${DB_URL:?supabase status did not expose DB_URL}"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$ROOT/stress/bin/bootstrap-cron-extensions.sql"
}

disable_local_migration_replay

if [[ "$MODE" == "start" ]]; then
  supabase start
else
  supabase db reset --local --no-seed
fi

bootstrap_extensions
restore_config
trap - EXIT INT TERM

supabase migration up --include-all