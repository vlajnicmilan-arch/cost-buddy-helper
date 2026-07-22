ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS balance_after numeric NULL,
  ADD COLUMN IF NOT EXISTS bank_row_seq integer NULL;

COMMENT ON COLUMN public.expenses.balance_after IS 'Bank-reported running balance after this transaction (import only, NULL for manual entries).';
COMMENT ON COLUMN public.expenses.bank_row_seq IS 'Zero-based position of this row inside its source bank statement (parser order). NULL for manual entries.';

CREATE INDEX IF NOT EXISTS idx_expenses_batch_row_seq
  ON public.expenses (import_batch_id, bank_row_seq)
  WHERE import_batch_id IS NOT NULL;