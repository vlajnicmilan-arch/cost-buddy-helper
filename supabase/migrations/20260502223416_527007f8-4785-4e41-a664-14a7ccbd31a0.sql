-- Add business_profile_id to custom_payment_sources for multi-company support
ALTER TABLE public.custom_payment_sources
ADD COLUMN IF NOT EXISTS business_profile_id uuid REFERENCES public.business_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_custom_payment_sources_business_profile_id
ON public.custom_payment_sources(business_profile_id);

-- Migrate existing is_business=true sources: leave business_profile_id NULL for now (user will assign)
-- Drop the obsolete is_business flag
DROP INDEX IF EXISTS idx_custom_payment_sources_is_business;
ALTER TABLE public.custom_payment_sources DROP COLUMN IF EXISTS is_business;