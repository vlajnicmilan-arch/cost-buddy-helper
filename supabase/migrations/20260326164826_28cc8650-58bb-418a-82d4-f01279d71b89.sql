ALTER TABLE public.business_profiles
  DROP COLUMN IF EXISTS certificate_password,
  DROP COLUMN IF EXISTS certificate_path,
  DROP COLUMN IF EXISTS certificate_uploaded_at,
  DROP COLUMN IF EXISTS eracuni_token,
  DROP COLUMN IF EXISTS eracuni_secret_key,
  DROP COLUMN IF EXISTS eracuni_username,
  DROP COLUMN IF EXISTS eracuni_connected,
  DROP COLUMN IF EXISTS fiscalization_enabled;