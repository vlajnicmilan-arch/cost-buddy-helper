ALTER TABLE public.custom_payment_sources
  ADD COLUMN IF NOT EXISTS is_business boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_custom_payment_sources_is_business
  ON public.custom_payment_sources(is_business);