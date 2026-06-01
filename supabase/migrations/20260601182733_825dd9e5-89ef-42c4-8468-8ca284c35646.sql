-- ============================================================
-- Release readiness fixes: pagination, atomicity, admin stats
-- ============================================================

-- 1) find_user_by_email: lookup user_id by email without paginating auth.admin.listUsers
--    Restricted to service_role (used only from edge functions running with service key)
CREATE OR REPLACE FUNCTION public.find_user_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  IF p_email IS NULL OR p_email = '' THEN
    RETURN NULL;
  END IF;
  SELECT id INTO v_uid
    FROM auth.users
   WHERE lower(email) = lower(p_email)
   LIMIT 1;
  RETURN v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.find_user_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_by_email(text) TO service_role;

-- 2) update_budget_with_categories: atomic budget+categories update
CREATE OR REPLACE FUNCTION public.update_budget_with_categories(
  p_budget_id uuid,
  p_patch jsonb,
  p_categories jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Authorisation: caller must be budget owner (mirrors existing RLS for budget_plans update)
  SELECT public.is_budget_owner(p_budget_id, v_uid) INTO v_owner;
  IF NOT v_owner THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  -- All three operations run in the function's implicit transaction
  UPDATE public.budget_plans SET
    name         = COALESCE(p_patch->>'name', name),
    description  = COALESCE(p_patch->>'description', description),
    icon         = COALESCE(p_patch->>'icon', icon),
    color        = COALESCE(p_patch->>'color', color),
    period_type  = COALESCE(p_patch->>'period_type', period_type),
    total_amount = COALESCE((p_patch->>'total_amount')::numeric, total_amount),
    start_date   = COALESCE((p_patch->>'start_date')::date, start_date),
    end_date     = NULLIF(p_patch->>'end_date','')::date,
    is_active    = COALESCE((p_patch->>'is_active')::boolean, is_active),
    is_recurring = COALESCE((p_patch->>'is_recurring')::boolean, is_recurring),
    project_id   = NULLIF(p_patch->>'project_id','')::uuid,
    updated_at   = now()
  WHERE id = p_budget_id;

  DELETE FROM public.budget_categories WHERE budget_id = p_budget_id;

  IF p_categories IS NOT NULL AND jsonb_array_length(p_categories) > 0 THEN
    INSERT INTO public.budget_categories (budget_id, category, limit_amount, icon, color)
    SELECT
      p_budget_id,
      c->>'category',
      (c->>'limit_amount')::numeric,
      c->>'icon',
      c->>'color'
    FROM jsonb_array_elements(p_categories) c;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_budget_with_categories(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_budget_with_categories(uuid, jsonb, jsonb) TO authenticated, service_role;

-- 3) get_admin_user_stats: accurate counts bypassing 1000-row default limit
CREATE OR REPLACE FUNCTION public.get_admin_user_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_seven  timestamptz := now() - interval '7 days';
  v_thirty timestamptz := now() - interval '30 days';
  v_active_7d int;
  v_active_30d int;
  v_total_users int;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  SELECT count(DISTINCT user_id) INTO v_active_7d
    FROM public.user_login_logs WHERE logged_in_at >= v_seven;

  SELECT count(DISTINCT user_id) INTO v_active_30d
    FROM public.user_login_logs WHERE logged_in_at >= v_thirty;

  SELECT count(*) INTO v_total_users FROM auth.users;

  RETURN jsonb_build_object(
    'active_users_7d',  v_active_7d,
    'active_users_30d', v_active_30d,
    'total_users',      v_total_users
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_user_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_user_stats() TO authenticated, service_role;