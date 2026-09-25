CREATE TABLE IF NOT EXISTS public.krug_notify_outbox (
  dedup_ref   text PRIMARY KEY,
  event_type  text NOT NULL,
  payload     jsonb NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  last_status integer,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

GRANT ALL ON public.krug_notify_outbox TO service_role;

ALTER TABLE public.krug_notify_outbox ENABLE ROW LEVEL SECURITY;