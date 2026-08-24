-- Extra columns the manual ↔ bank merge harness needs on top of the curated
-- balance baseline (supabase/tests/balance/baseline.sql).
--
-- Production `expenses` has these already; the curated baseline is minimal by
-- design, so the merge harness adds exactly what `merge_manual_with_bank`
-- reads or writes — nothing more.

\set ON_ERROR_STOP on

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS currency             text,
  ADD COLUMN IF NOT EXISTS merchant_name        text,
  ADD COLUMN IF NOT EXISTS receipt_url          text,
  ADD COLUMN IF NOT EXISTS is_advance           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS linked_advance_ids   uuid[],
  ADD COLUMN IF NOT EXISTS deleted_by           uuid,
  ADD COLUMN IF NOT EXISTS bank_transaction_id  text,
  ADD COLUMN IF NOT EXISTS bank_match_status    text,
  ADD COLUMN IF NOT EXISTS bank_account_id      uuid,
  ADD COLUMN IF NOT EXISTS import_batch_id      uuid,
  ADD COLUMN IF NOT EXISTS balance_after        numeric,
  ADD COLUMN IF NOT EXISTS bank_row_seq         integer,
  ADD COLUMN IF NOT EXISTS bank_raw_line        text,
  ADD COLUMN IF NOT EXISTS bank_raw_line_source text,
  ADD COLUMN IF NOT EXISTS budget_id            uuid,
  ADD COLUMN IF NOT EXISTS krug_id              uuid;

-- Same shape as production: a plain (non-partial) unique index, so a
-- soft-deleted row still occupies its fingerprint. This is exactly what
-- forces the merge to MOVE the fingerprint instead of copying it.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_expenses_user_bank_tx
  ON public.expenses (user_id, bank_transaction_id);

-- ---------------------------------------------------------------------------
-- Production parity: CHECK constraints on `expenses` that the merge path can
-- violate. The 23514 failure of 24.08.2026 (bank_match_status =
-- 'merged_into_manual' rejected in production) slipped past 30 green
-- assertions precisely because the harness table had no constraints at all.
-- Mirrors the production definitions as of migration 20260824201941.
-- ---------------------------------------------------------------------------
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_bank_match_status_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_bank_match_status_check
  CHECK (bank_match_status = ANY (ARRAY['manual','pending_bank','confirmed','bank_only','merged_into_manual']));

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_type_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_type_check
  CHECK (type = ANY (ARRAY['expense','income','transfer']));

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_payment_source_canonical_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_payment_source_canonical_check
  CHECK (payment_source IS NULL OR payment_source ~ '^(custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z][a-z0-9_]*)$');
