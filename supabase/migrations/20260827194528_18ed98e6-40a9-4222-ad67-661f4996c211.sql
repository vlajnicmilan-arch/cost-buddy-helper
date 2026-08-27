CREATE OR REPLACE FUNCTION public.get_admin_active_user_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_24h int;
  v_7d  int;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  SELECT count(DISTINCT user_id) INTO v_24h
    FROM public.user_login_logs
    WHERE logged_in_at >= now() - interval '24 hours';

  SELECT count(DISTINCT user_id) INTO v_7d
    FROM public.user_login_logs
    WHERE logged_in_at >= now() - interval '7 days';

  RETURN jsonb_build_object(
    'active_users_24h', v_24h,
    'active_users_7d',  v_7d
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_active_user_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_active_user_counts() TO authenticated, service_role;