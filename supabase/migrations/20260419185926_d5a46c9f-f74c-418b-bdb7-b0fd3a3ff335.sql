ALTER TABLE public.push_delivery_logs
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS dispatch_status text,
  ADD COLUMN IF NOT EXISTS dispatch_error text,
  ADD COLUMN IF NOT EXISTS send_push_http_status int,
  ADD COLUMN IF NOT EXISTS lifecycle_stage text;

CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_request_id
  ON public.push_delivery_logs (request_id);

CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_lifecycle_stage
  ON public.push_delivery_logs (lifecycle_stage);

CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_created_at_desc
  ON public.push_delivery_logs (created_at DESC);