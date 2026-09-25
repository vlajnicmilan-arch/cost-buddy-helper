-- Dodaci povrh worker_payout_notify podloge.
ALTER TABLE public.project_worker_payouts
  ADD COLUMN voided_at timestamptz, ADD COLUMN deleted_at timestamptz,
  ADD COLUMN paid_at timestamptz DEFAULT now(), ADD COLUMN payment_source text, ADD COLUMN expense_id uuid;
CREATE TABLE public.custom_payment_sources (id uuid PRIMARY KEY, user_id uuid NOT NULL, currency text);
CREATE TABLE public.profiles (user_id uuid PRIMARY KEY, display_name text);
