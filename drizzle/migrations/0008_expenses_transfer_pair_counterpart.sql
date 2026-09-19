ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS counterpart_bank_transaction_id text,
  ADD COLUMN IF NOT EXISTS counterpart_bank_raw_line text,
  ADD COLUMN IF NOT EXISTS transfer_counterpart_origin text;

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_transfer_counterpart_origin_chk;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_transfer_counterpart_origin_chk
  CHECK (
    transfer_counterpart_origin IS NULL
    OR transfer_counterpart_origin = ANY (ARRAY['card'::text, 'name'::text, 'pair'::text, 'rule'::text, 'manual'::text, 'statement'::text])
  );

CREATE INDEX IF NOT EXISTS idx_expenses_user_counterpart_bank_tx
  ON public.expenses (user_id, counterpart_bank_transaction_id)
  WHERE counterpart_bank_transaction_id IS NOT NULL;