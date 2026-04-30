
-- Lifetime purchases table
CREATE TABLE public.lifetime_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  founding_member_number INTEGER NOT NULL,
  amount_paid INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_lifetime_purchases_founding_number ON public.lifetime_purchases(founding_member_number);

ALTER TABLE public.lifetime_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own lifetime purchase"
ON public.lifetime_purchases FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins view all lifetime purchases"
ON public.lifetime_purchases FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage lifetime purchases"
ON public.lifetime_purchases FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Function to get next founding member number atomically
CREATE OR REPLACE FUNCTION public.get_next_founding_member_number()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(founding_member_number), 0) + 1
  INTO next_num
  FROM public.lifetime_purchases;
  RETURN next_num;
END;
$$;

-- Public function to read remaining founding member slots (no auth required)
CREATE OR REPLACE FUNCTION public.get_founding_member_count()
RETURNS INTEGER
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM public.lifetime_purchases;
$$;

GRANT EXECUTE ON FUNCTION public.get_founding_member_count() TO anon, authenticated;

-- Subscription migration log (audit trail for instant migrations)
CREATE TABLE public.subscription_migration_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT NOT NULL,
  old_price_id TEXT NOT NULL,
  new_price_id TEXT NOT NULL,
  old_amount_cents INTEGER,
  new_amount_cents INTEGER,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email_sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_migration_log_user ON public.subscription_migration_log(user_id);
CREATE INDEX idx_migration_log_subscription ON public.subscription_migration_log(stripe_subscription_id);

ALTER TABLE public.subscription_migration_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view migration log"
ON public.subscription_migration_log FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage migration log"
ON public.subscription_migration_log FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
