#!/usr/bin/env bash
# Reset local Supabase DB and apply all migrations.
# Faza 1 requires Supabase CLI — no psql-only fallback (that path cannot
# reset GoTrue/PostgREST state and gives false confidence).
set -euo pipefail

if ! command -v supabase >/dev/null 2>&1; then
  echo "reset-db: Supabase CLI is required (see run-all.sh)" >&2
  exit 1
fi

echo "reset-db: using supabase CLI with cron extension bootstrap"
bash "$(cd "$(dirname "$0")" && pwd)/bootstrap-local-db.sh" reset
