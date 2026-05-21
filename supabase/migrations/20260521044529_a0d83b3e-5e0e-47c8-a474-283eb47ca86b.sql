ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS bank_match_status text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS possible_duplicate_of uuid NULL REFERENCES public.expenses(id) ON DELETE SET NULL;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_bank_match_status_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_bank_match_status_check
  CHECK (bank_match_status IN ('manual','pending_bank','confirmed','bank_only'));

CREATE INDEX IF NOT EXISTS idx_expenses_bank_match_status
  ON public.expenses(user_id, bank_match_status)
  WHERE bank_match_status IN ('pending_bank','bank_only');