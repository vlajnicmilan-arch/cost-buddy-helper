-- 1) user_subscriptions: drop mrtvih Stripe kolona
ALTER TABLE public.user_subscriptions DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE public.user_subscriptions DROP COLUMN IF EXISTS stripe_subscription_id;

-- 2) Drop mrtvih tablica (CASCADE ruši samo vlastite indexe/constrainte/RLS politike — provjereno)
DROP TABLE IF EXISTS public.lifetime_purchases CASCADE;
DROP TABLE IF EXISTS public.subscription_migration_log CASCADE;

-- 3) Drop mrtvih RPC funkcija (0 vanjskih ovisnika)
DROP FUNCTION IF EXISTS public.get_founding_member_count() CASCADE;
DROP FUNCTION IF EXISTS public.get_next_founding_member_number() CASCADE;

-- 4) Suzi CHECK constraint na user_entitlements.source
ALTER TABLE public.user_entitlements DROP CONSTRAINT IF EXISTS user_entitlements_source_check;
ALTER TABLE public.user_entitlements
  ADD CONSTRAINT user_entitlements_source_check
  CHECK (source = ANY (ARRAY['paddle'::text, 'trial'::text, 'admin_grant'::text, 'migration'::text]));