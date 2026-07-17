
-- =========================================================
-- FAZA 5 — DB temelj
-- =========================================================

-- 1) Kill-switch: entitlements_mode ('legacy' | 'dual' | 'entitlements')
INSERT INTO public.app_settings (key, value)
VALUES ('entitlements_mode', '"dual"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2) Trial trigger — nakon signupa dodaj 3 trial retka (smjer/krug/projekti, +30 dana)
CREATE OR REPLACE FUNCTION public.create_trial_entitlements()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_entitlements
    (user_id, module, source, status, period_start, period_end, billing_cycle)
  SELECT
    NEW.id, m, 'trial', 'active', now(), now() + interval '30 days', 'trial'
  FROM (VALUES ('smjer'), ('krug'), ('projekti')) AS x(m)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_entitlements
    WHERE user_id = NEW.id AND module = x.m
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Ne rušimo signup ako trial insert padne
  RAISE WARNING 'create_trial_entitlements failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_trial ON auth.users;
CREATE TRIGGER on_auth_user_created_trial
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_trial_entitlements();

-- 3) is_projects_subscriber → delegat na has_entitlement
--    ROLLBACK (stara definicija):
--    SELECT
--      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
--      OR EXISTS (SELECT 1 FROM public.user_subscriptions us
--                 WHERE us.user_id = _user_id AND us.tier IN ('pro','business')
--                   AND (us.expires_at IS NULL OR us.expires_at > now()))
--      OR EXISTS (SELECT 1 FROM public.lifetime_purchases WHERE user_id = _user_id)
--      OR EXISTS (SELECT 1 FROM public.admin_module_grants
--                 WHERE user_id = _user_id AND revoked_at IS NULL
--                   AND (expires_at IS NULL OR expires_at > now())
--                   AND module = 'projects');
CREATE OR REPLACE FUNCTION public.is_projects_subscriber(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_entitlement(_user_id, 'projekti')
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin');
$$;

-- 4) Mjesečno brojanje AI poziva (za trial 150/mj limit)
CREATE TABLE IF NOT EXISTS public.ai_usage_monthly (
  user_id uuid NOT NULL,
  usage_month date NOT NULL DEFAULT date_trunc('month', now() AT TIME ZONE 'UTC')::date,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_month)
);

GRANT SELECT ON public.ai_usage_monthly TO authenticated;
GRANT ALL ON public.ai_usage_monthly TO service_role;

ALTER TABLE public.ai_usage_monthly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own ai monthly usage" ON public.ai_usage_monthly;
CREATE POLICY "Users view own ai monthly usage"
  ON public.ai_usage_monthly
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 5) increment_ai_usage_v2 — vraća daily + monthly gate
CREATE OR REPLACE FUNCTION public.increment_ai_usage_v2(
  p_route text,
  p_daily_limit integer,
  p_monthly_limit integer DEFAULT NULL
)
RETURNS TABLE(
  allowed boolean,
  daily_allowed boolean,
  monthly_allowed boolean,
  daily_count integer,
  monthly_count integer,
  daily_limit integer,
  monthly_limit integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  v_daily integer;
  v_monthly integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO public.ai_usage_daily (user_id, usage_date, route, count, updated_at)
  VALUES (v_uid, v_today, p_route, 1, now())
  ON CONFLICT (user_id, usage_date, route) DO UPDATE
    SET count = ai_usage_daily.count + 1,
        updated_at = now()
  RETURNING count INTO v_daily;

  INSERT INTO public.ai_usage_monthly (user_id, usage_month, count, updated_at)
  VALUES (v_uid, v_month, 1, now())
  ON CONFLICT (user_id, usage_month) DO UPDATE
    SET count = ai_usage_monthly.count + 1,
        updated_at = now()
  RETURNING count INTO v_monthly;

  RETURN QUERY SELECT
    (v_daily <= p_daily_limit AND (p_monthly_limit IS NULL OR v_monthly <= p_monthly_limit)),
    (v_daily <= p_daily_limit),
    (p_monthly_limit IS NULL OR v_monthly <= p_monthly_limit),
    v_daily,
    v_monthly,
    p_daily_limit,
    COALESCE(p_monthly_limit, -1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_ai_usage_v2(text, integer, integer) TO authenticated, service_role;
