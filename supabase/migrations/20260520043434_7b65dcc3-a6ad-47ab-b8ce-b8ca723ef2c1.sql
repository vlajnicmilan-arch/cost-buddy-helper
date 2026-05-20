DROP INDEX IF EXISTS public.uniq_expenses_user_bank_tx;

CREATE UNIQUE INDEX uniq_expenses_user_bank_tx
  ON public.expenses (user_id, bank_transaction_id);