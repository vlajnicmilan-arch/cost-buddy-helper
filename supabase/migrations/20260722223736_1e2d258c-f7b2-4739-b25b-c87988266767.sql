-- 1) Ugasi auto-trial trigger na auth.users (postojeći trial redovi ostaju kao "iskorišteno")
DROP TRIGGER IF EXISTS on_auth_user_created_trial ON auth.users;
-- Funkciju create_trial_entitlements zadržavamo (ne poziva se više nigdje) za auditni trag;
-- može biti obrisana kasnije zasebnim čišćenjem.

-- 2) RPC za svjesnu aktivaciju triala per modul
CREATE OR REPLACE FUNCTION public.activate_module_trial(_module text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing_end timestamptz;
  _new_end timestamptz;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _module NOT IN ('smjer','krug','projekti') THEN
    RAISE EXCEPTION 'invalid_module' USING ERRCODE = '22023';
  END IF;

  SELECT period_end INTO _existing_end
  FROM public.user_entitlements
  WHERE user_id = _uid
    AND module = _module
    AND source = 'trial'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'already_used', true,
      'period_end', _existing_end
    );
  END IF;

  _new_end := now() + interval '30 days';

  INSERT INTO public.user_entitlements (user_id, module, source, status, period_start, period_end)
  VALUES (_uid, _module, 'trial', 'active', now(), _new_end);

  RETURN jsonb_build_object(
    'activated', true,
    'period_end', _new_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_module_trial(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_module_trial(text) TO authenticated;