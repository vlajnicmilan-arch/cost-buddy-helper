#!/usr/bin/env bash
# Fail-closed: refuse to run harness against any non-local URL.
set -euo pipefail

if [[ -f "${STRESS_ENV_FILE:-stress/.env}" ]]; then
  # shellcheck disable=SC1090
  set -a; source "${STRESS_ENV_FILE:-stress/.env}"; set +a
fi

URL="${STRESS_SUPABASE_URL:-}"
DB_URL="${STRESS_SUPABASE_DB_URL:-}"

if [[ -z "$URL" ]]; then
  echo "guard-env: STRESS_SUPABASE_URL is empty" >&2
  exit 1
fi

check_local() {
  local u="$1" label="$2"
  # Accept only http(s)://localhost[:port] or 127.0.0.1 or postgresql://...@localhost/127.0.0.1
  if [[ "$u" =~ ^(https?|postgresql|postgres)://([^@]+@)?(localhost|127\.0\.0\.1)(:[0-9]+)?(/.*)?$ ]]; then
    return 0
  fi
  echo "guard-env: REFUSING TO RUN AGAINST NON-LOCAL URL ($label=$u)" >&2
  echo "guard-env: only localhost / 127.0.0.1 is allowed" >&2
  exit 1
}

check_local "$URL" "STRESS_SUPABASE_URL"
if [[ -n "$DB_URL" ]]; then
  check_local "$DB_URL" "STRESS_SUPABASE_DB_URL"
fi

# Extra safety: refuse if any *.supabase.co or *.supabase.in appears anywhere in env.
if env | grep -Ei 'supabase\.(co|in)' >/dev/null; then
  echo "guard-env: environment contains a remote supabase host — refusing to run" >&2
  env | grep -Ei 'supabase\.(co|in)' >&2
  exit 1
fi

echo "guard-env: OK ($URL)"
