
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS linked_payment_source_id uuid REFERENCES public.custom_payment_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_error text;

CREATE INDEX IF NOT EXISTS idx_bank_accounts_linked_payment_source
  ON public.bank_accounts(linked_payment_source_id);

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS bank_transaction_id text,
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_bank_transaction_id
  ON public.expenses(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_bank_account_id
  ON public.expenses(bank_account_id) WHERE bank_account_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_expenses_user_bank_tx
  ON public.expenses(user_id, bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;
