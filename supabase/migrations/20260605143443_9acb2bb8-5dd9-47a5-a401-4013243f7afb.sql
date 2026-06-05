-- Sprint 2 E2E: dedicated flag for test users + reset RPC

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_e2e_user boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_e2e_user
  ON public.profiles (user_id) WHERE is_e2e_user = true;

-- Reset RPC: wipes user-scoped data for an E2E user only.
-- Hard-guarded: requires profiles.is_e2e_user = true AND email matches e2e+%@vmbalance.com.
-- Defense in depth: both checks must pass.
CREATE OR REPLACE FUNCTION public.e2e_reset_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_e2e boolean;
  v_email text;
BEGIN
  SELECT is_e2e_user INTO v_is_e2e
  FROM public.profiles WHERE user_id = p_user_id;

  SELECT email INTO v_email
  FROM auth.users WHERE id = p_user_id;

  IF COALESCE(v_is_e2e, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'e2e_reset_user: user % is not flagged is_e2e_user', p_user_id
      USING ERRCODE = '42501';
  END IF;

  IF v_email IS NULL OR v_email NOT LIKE 'e2e+%@vmbalance.com' THEN
    RAISE EXCEPTION 'e2e_reset_user: email guard failed for user %', p_user_id
      USING ERRCODE = '42501';
  END IF;

  -- Wipe scope (covers Sprint 2 flows; bank/krug/family out of scope)
  DELETE FROM public.expenses WHERE user_id = p_user_id;
  DELETE FROM public.project_milestones WHERE project_id IN
    (SELECT id FROM public.projects WHERE user_id = p_user_id);
  DELETE FROM public.projects WHERE user_id = p_user_id;
  DELETE FROM public.budgets WHERE user_id = p_user_id;
  DELETE FROM public.payment_sources WHERE user_id = p_user_id;
  DELETE FROM public.recurring_transactions WHERE user_id = p_user_id;
  DELETE FROM public.user_categories WHERE user_id = p_user_id;
  DELETE FROM public.welcome_checklist_state WHERE user_id = p_user_id;
  DELETE FROM public.funnel_events WHERE user_id = p_user_id;

  -- Reset onboarding so signup→onboarding flow can re-run
  UPDATE public.profiles
     SET onboarding_completed = false
   WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_reset_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_reset_user(uuid) TO service_role;

COMMENT ON FUNCTION public.e2e_reset_user(uuid) IS
  'Sprint 2 E2E only. Resets data for is_e2e_user=true profiles whose email matches e2e+%@vmbalance.com. service_role only.';