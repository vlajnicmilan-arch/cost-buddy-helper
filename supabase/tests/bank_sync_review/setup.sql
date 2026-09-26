-- bank_sync_review: dodaci na balance baseline (stvarni expenses + okidač salda).
\set ON_ERROR_STOP on
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS bank_transaction_id text,
  ADD COLUMN IF NOT EXISTS bank_account_id uuid,
  ADD COLUMN IF NOT EXISTS bank_match_status text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS bank_raw_line text,
  ADD COLUMN IF NOT EXISTS bank_raw_line_source text,
  ADD COLUMN IF NOT EXISTS payment_source_card_id uuid,
  ADD COLUMN IF NOT EXISTS business_profile_id uuid,
  ADD COLUMN IF NOT EXISTS currency text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_expenses_user_bank_tx ON public.expenses (user_id, bank_transaction_id);

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  linked_payment_source_id uuid
);

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

INSERT INTO auth.users(id, email) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'bsr-a@test.local'),
  ('b0000000-0000-0000-0000-00000000000b', 'bsr-b@test.local')
ON CONFLICT DO NOTHING;

INSERT INTO public.custom_payment_sources(id, user_id, name, balance) VALUES
  ('c1000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-00000000000a', 'A tekući', 1000),
  ('c2000000-0000-0000-0000-0000000000c2', 'a0000000-0000-0000-0000-00000000000a', 'A štednja', 500),
  ('c3000000-0000-0000-0000-0000000000c3', 'b0000000-0000-0000-0000-00000000000b', 'B tekući', 300);

INSERT INTO public.bank_accounts(id, user_id, linked_payment_source_id) VALUES
  ('ba000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-0000000000c1'),
  ('ba000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'c3000000-0000-0000-0000-0000000000c3');
GRANT SELECT ON public.expenses TO authenticated;
