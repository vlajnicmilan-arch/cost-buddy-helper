-- 1) get_ai_monthly_spend: OUT parametar `month_key` je zasjenio istoimeni
--    stupac tablice → 'column reference "month_key" is ambiguous'. Brana AI
--    troška zbog toga NIJE mjerila potrošnju (fail-open). Kvalificiramo stupac.
CREATE OR REPLACE FUNCTION public.get_ai_monthly_spend()
 RETURNS TABLE(month_key date, spent_eur numeric, cap_eur numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  v_cap numeric;
BEGIN
  SELECT (value)::text::numeric INTO v_cap
    FROM app_settings WHERE key = 'ai_monthly_cap_eur';
  v_cap := COALESCE(v_cap, 100);
  RETURN QUERY
    SELECT v_month,
           COALESCE((SELECT SUM(acm.total_eur) FROM ai_cost_monthly acm
                      WHERE acm.month_key = v_month), 0)::numeric,
           v_cap;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_ai_monthly_spend() FROM anon;

-- 2) has_any_paid_plan: `public.lifetime_purchases` je obrisana (DROP ... CASCADE,
--    07/2026), pa je svaki poziv padao s 'relation does not exist' i rušio
--    core scan kvotu. Mrtvu referencu zamjenjujemo živim izvorom istine za
--    administrativno dodijeljen pristup (admin_module_grants).
CREATE OR REPLACE FUNCTION public.has_any_paid_plan(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      WHERE us.user_id = _user_id
        AND us.tier IN ('pro','business')
        AND (us.expires_at IS NULL OR us.expires_at > now())
    )
    OR EXISTS (
      SELECT 1 FROM public.admin_module_grants g
      WHERE g.user_id = _user_id
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.has_any_paid_plan(uuid) FROM anon;