-- Curated balance baseline schema for CI.
--
-- Provides ONLY the tables and columns that balance-relevant migrations
-- (listed in BALANCE_MIGRATIONS.txt) and the SQL harness require.
--
-- Rationale: full migration history is not linearly replayable on a plain
-- postgres:16 (see .lovable/plan.md — "Redizajn balance-sql-suite.yml").
-- This baseline replaces "apply all 246 migrations" with a minimal, stable
-- foundation the balance engine can be tested against in isolation.
--
-- Scope:
--   - public.custom_payment_sources — pre-anchor base columns
--   - public.expenses               — pre-event_at base columns
--   - public.app_settings           — key/value store
--
-- NOT included: RLS, GRANTs, non-balance indexes, other 90+ tables.
-- Anchor / event_at / time_confidence / user_edited_event_at columns are
-- ADDED by the balance migrations themselves (all use IF NOT EXISTS), so
-- creating the tables here without them is safe.
--
-- Runs AFTER bootstrap.sql (auth/storage/role stubs, auth.users seed).

\set ON_ERROR_STOP on

-- ---- public.custom_payment_sources ----------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_payment_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---- public.expenses ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'expense',
  amount numeric(12,2) NOT NULL,
  payment_source text,
  income_source_id uuid,
  date timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  expense_nature text DEFAULT 'regular',
  description text,
  category text,
  note text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_payment_source_idx
  ON public.expenses (payment_source);
CREATE INDEX IF NOT EXISTS expenses_income_source_id_idx
  ON public.expenses (income_source_id);
CREATE INDEX IF NOT EXISTS expenses_user_id_idx
  ON public.expenses (user_id);

-- ---- public.app_settings --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
