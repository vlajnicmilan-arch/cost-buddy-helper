ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS accounting_handover_enabled boolean NOT NULL DEFAULT false;