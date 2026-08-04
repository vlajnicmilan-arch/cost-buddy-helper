CREATE OR REPLACE FUNCTION public.has_entitlement(_user_id uuid, _module text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    -- Direktan entitlement
    SELECT 1 FROM public.user_entitlements
    WHERE user_id = _user_id
      AND module = _module
      AND status = 'active'
      AND (period_end IS NULL OR period_end > now())
  ) OR EXISTS (
    -- Legacy mapping preko pro_legacy / business_legacy
    -- NAPOMENA: business_legacy VIŠE NE otključava 'biznis' (odluka 4.8.2026).
    SELECT 1 FROM public.user_entitlements
    WHERE user_id = _user_id
      AND status = 'active'
      AND (period_end IS NULL OR period_end > now())
      AND (
        (module = 'pro_legacy' AND _module IN ('smjer','krug','projekti'))
        OR (module = 'business_legacy' AND _module IN ('smjer','krug','projekti'))
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
$function$;

REVOKE EXECUTE ON FUNCTION public.has_entitlement(uuid, text) FROM anon;