ALTER TABLE public.business_profiles 
ADD COLUMN IF NOT EXISTS eracuni_username text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS eracuni_secret_key text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS eracuni_token text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS eracuni_connected boolean DEFAULT false;

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS fiscalization_jir text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS fiscalization_zki text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS fiscalized_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS eracun_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS eracun_sent_at timestamp with time zone DEFAULT NULL;