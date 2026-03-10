
-- Add is_active column
ALTER TABLE public.business_profiles ADD COLUMN is_active boolean NOT NULL DEFAULT false;

-- Set existing profiles as active
UPDATE public.business_profiles SET is_active = true;

-- Create partial unique index: only one active profile per user
CREATE UNIQUE INDEX business_profiles_user_active_unique 
ON public.business_profiles (user_id) WHERE (is_active = true);
