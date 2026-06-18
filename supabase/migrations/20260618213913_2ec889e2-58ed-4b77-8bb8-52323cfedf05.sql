
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS guided_home_exited_at timestamptz NULL;

UPDATE public.profiles
  SET guided_home_exited_at = now()
  WHERE onboarding_completed = true
    AND guided_home_exited_at IS NULL;

CREATE OR REPLACE FUNCTION public.mark_guided_home_exited()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_ts timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.profiles
    SET guided_home_exited_at = now()
    WHERE user_id = v_user
      AND guided_home_exited_at IS NULL
    RETURNING guided_home_exited_at INTO v_ts;

  IF v_ts IS NULL THEN
    SELECT guided_home_exited_at INTO v_ts
      FROM public.profiles
      WHERE user_id = v_user;
  END IF;

  RETURN v_ts;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_guided_home_exited() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_guided_home_exited() TO authenticated;
