ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_expenses_client_request
  ON public.expenses (user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;