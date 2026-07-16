
-- FAZA 1: Entitlements DB temelj

-- 1. user_entitlements
CREATE TABLE public.user_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('smjer','krug','projekti','biznis','pro_legacy','business_legacy')),
  source TEXT NOT NULL CHECK (source IN ('paddle','stripe_legacy','lifetime','trial','admin_grant','migration')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','canceled','past_due','paused','expired','refunded')),
  period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_end TIMESTAMPTZ,
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly','yearly','lifetime','trial')),
  provider TEXT,
  provider_sub_id TEXT,
  provider_price_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, module, provider_sub_id)
);

CREATE INDEX idx_user_entitlements_user_module ON public.user_entitlements(user_id, module);
CREATE INDEX idx_user_entitlements_active_lookup ON public.user_entitlements(user_id, module, status, period_end);
CREATE INDEX idx_user_entitlements_provider_sub ON public.user_entitlements(provider, provider_sub_id) WHERE provider_sub_id IS NOT NULL;

GRANT SELECT ON public.user_entitlements TO authenticated;
GRANT ALL ON public.user_entitlements TO service_role;

ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entitlements"
  ON public.user_entitlements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Sav DML samo service_role (nema policies za INSERT/UPDATE/DELETE → blokirano za authenticated).

CREATE TRIGGER update_user_entitlements_updated_at
  BEFORE UPDATE ON public.user_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. webhook_events (idempotencija)
CREATE TABLE public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE INDEX idx_webhook_events_unprocessed ON public.webhook_events(provider, received_at) WHERE processed_at IS NULL;

GRANT ALL ON public.webhook_events TO service_role;
-- Namjerno: nema GRANT-a za anon/authenticated (samo service_role webhook handler piše/čita).

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
-- Nema policija = svi authenticated/anon zahtjevi blokirani; service_role bypassa RLS.

-- 3. has_entitlement RPC
-- Aktivan entitlement = status='active' AND (period_end IS NULL OR period_end > now()).
-- Legacy mapping: pro_legacy → smjer+krug+projekti; business_legacy → smjer+krug+projekti+biznis.
-- Admin_module_grants: 'projects' → projekti, 'business' → biznis (samo dok legacy hook postoji).
CREATE OR REPLACE FUNCTION public.has_entitlement(_user_id UUID, _module TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Direktan entitlement
    SELECT 1 FROM public.user_entitlements
    WHERE user_id = _user_id
      AND module = _module
      AND status = 'active'
      AND (period_end IS NULL OR period_end > now())
  ) OR EXISTS (
    -- Legacy mapping preko pro_legacy / business_legacy
    SELECT 1 FROM public.user_entitlements
    WHERE user_id = _user_id
      AND status = 'active'
      AND (period_end IS NULL OR period_end > now())
      AND (
        (module = 'pro_legacy' AND _module IN ('smjer','krug','projekti'))
        OR (module = 'business_legacy' AND _module IN ('smjer','krug','projekti','biznis'))
      )
  ) OR EXISTS (
    -- Admin module grants (legacy sustav)
    SELECT 1 FROM public.admin_module_grants
    WHERE user_id = _user_id
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
      AND (
        (module = 'projects' AND _module = 'projekti')
        OR (module = 'business' AND _module = 'biznis')
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_entitlement(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_entitlement(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_entitlement(UUID, TEXT) TO authenticated, service_role;

-- 4. POPULATE: brišemo 6 testnih user_subscriptions zapisa PRIJE punjenja
DELETE FROM public.user_subscriptions;

-- 5. Trial retci za sve korisnike (smjer/krug/projekti, period_end = profiles.created_at + 30d)
INSERT INTO public.user_entitlements
  (user_id, module, source, status, period_start, period_end, billing_cycle, metadata)
SELECT
  p.user_id,
  m.module,
  'trial',
  'active',
  p.created_at,
  p.created_at + INTERVAL '30 days',
  'trial',
  jsonb_build_object('backfilled_at', now()::text, 'reason', 'initial_migration_trial')
FROM public.profiles p
CROSS JOIN (VALUES ('smjer'::text), ('krug'), ('projekti')) AS m(module)
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_entitlements e
  WHERE e.user_id = p.user_id AND e.module = m.module AND e.source = 'trial'
);

-- 6. Milan + hr.akrobat: admin_grant entitlementi za SVE module (period_end NULL)
INSERT INTO public.user_entitlements
  (user_id, module, source, status, period_start, period_end, metadata)
SELECT
  u.id,
  m.module,
  'admin_grant',
  'active',
  now(),
  NULL,
  jsonb_build_object('reason', 'faza1_test_account', 'email', u.email)
FROM auth.users u
CROSS JOIN (VALUES ('smjer'::text),('krug'),('projekti'),('biznis'),('pro_legacy'),('business_legacy')) AS m(module)
WHERE u.email IN ('vlajnic.milan@gmail.com','hr.akrobat@gmail.com')
ON CONFLICT (user_id, module, provider_sub_id) DO NOTHING;
