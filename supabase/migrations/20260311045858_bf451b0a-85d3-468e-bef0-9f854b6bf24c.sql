
ALTER TABLE public.business_profiles 
  ADD COLUMN IF NOT EXISTS industry_type text DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS enabled_modules text[] DEFAULT '{}';
