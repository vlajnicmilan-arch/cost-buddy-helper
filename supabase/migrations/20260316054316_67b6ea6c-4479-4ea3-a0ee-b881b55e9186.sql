ALTER TABLE public.custom_payment_sources 
ADD COLUMN business_profile_id uuid REFERENCES public.business_profiles(id) ON DELETE CASCADE DEFAULT NULL;