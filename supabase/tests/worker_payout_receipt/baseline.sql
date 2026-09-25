-- Dodaci za potvrdu primitka isplate (povrh balance + krug_settle podloge).
ALTER TABLE public.project_worker_payouts ADD COLUMN IF NOT EXISTS batch_id uuid;
ALTER TABLE public.project_worker_payouts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS worker_payout_id uuid;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS worker_payout_batch_id uuid;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS movement_kind text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS submitted_by uuid;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS currency text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_expenses_user_worker_payout
  ON public.expenses (user_id, worker_payout_id) WHERE worker_payout_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_expenses_user_worker_payout_batch
  ON public.expenses (user_id, worker_payout_batch_id) WHERE worker_payout_batch_id IS NOT NULL;
