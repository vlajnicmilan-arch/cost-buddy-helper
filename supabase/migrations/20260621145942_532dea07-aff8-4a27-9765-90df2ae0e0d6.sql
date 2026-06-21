ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS recurring_transaction_id uuid
  REFERENCES public.recurring_transactions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_recurring_per_day
  ON public.expenses (user_id, recurring_transaction_id, date)
  WHERE recurring_transaction_id IS NOT NULL AND deleted_at IS NULL;