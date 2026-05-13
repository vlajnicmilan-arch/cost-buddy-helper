ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS business_profile_id uuid REFERENCES public.business_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS bank_accounts_business_profile_id_idx ON public.bank_accounts(business_profile_id);
CREATE INDEX IF NOT EXISTS bank_connections_business_profile_id_idx ON public.bank_connections(business_profile_id);