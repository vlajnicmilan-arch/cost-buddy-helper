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
    )
    OR EXISTS (
      SELECT 1 FROM public.user_entitlements e
      WHERE e.user_id = _user_id
        AND e.status = 'active'
        AND (e.period_end IS NULL OR e.period_end > now())
    );
$function$;