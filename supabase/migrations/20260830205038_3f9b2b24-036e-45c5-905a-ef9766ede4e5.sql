-- JEDAN IZVOR ISTINE ZA MJESEČNU GRANICU UVOZA IZ MAILA.
-- Ista funkcija služi i prikazu (mail_import_quota_status) i naplati
-- (mail_import_consume_quota) — traka i stvarna kvota se ne mogu razići.
CREATE OR REPLACE FUNCTION public.mail_import_monthly_limit(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.has_any_paid_plan(_user_id)            -- modul (plaćen, probni, poček), admin, legacy pretplata
      OR public.has_entitlement(_user_id, 'mail_uvoz') -- naslijeđeno posebno pravo
    THEN 100
    ELSE 5
  END;
$function$;

REVOKE ALL ON FUNCTION public.mail_import_monthly_limit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_import_monthly_limit(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mail_import_quota_status(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer;
  v_used integer;
BEGIN
  v_limit := public.mail_import_monthly_limit(p_user_id);
  SELECT COALESCE(processed_count, 0) INTO v_used
    FROM public.mail_import_usage_monthly
   WHERE user_id = p_user_id AND period_month = date_trunc('month', now())::date;
  RETURN jsonb_build_object('limit', v_limit, 'used', COALESCE(v_used, 0));
END;
$function$;

CREATE OR REPLACE FUNCTION public.mail_import_consume_quota(p_user_id uuid, p_count integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer;
  v_month date := date_trunc('month', now())::date;
  v_used integer;
BEGIN
  v_limit := public.mail_import_monthly_limit(p_user_id);

  INSERT INTO public.mail_import_usage_monthly (user_id, period_month, processed_count)
  VALUES (p_user_id, v_month, 0)
  ON CONFLICT (user_id, period_month) DO NOTHING;

  SELECT processed_count INTO v_used
    FROM public.mail_import_usage_monthly
   WHERE user_id = p_user_id AND period_month = v_month
     FOR UPDATE;

  IF v_used + p_count > v_limit THEN
    RETURN jsonb_build_object('allowed', false, 'limit', v_limit, 'used', v_used);
  END IF;

  UPDATE public.mail_import_usage_monthly
     SET processed_count = processed_count + p_count, updated_at = now()
   WHERE user_id = p_user_id AND period_month = v_month;

  RETURN jsonb_build_object('allowed', true, 'limit', v_limit, 'used', v_used + p_count);
END;
$function$;