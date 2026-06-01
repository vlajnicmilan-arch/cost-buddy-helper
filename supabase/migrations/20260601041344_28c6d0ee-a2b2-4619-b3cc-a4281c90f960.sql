
-- AI usage tracking per user/day/route for abuse prevention
CREATE TABLE public.ai_usage_daily (
  user_id UUID NOT NULL,
  usage_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  route TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date, route)
);

GRANT SELECT ON public.ai_usage_daily TO authenticated;
GRANT ALL ON public.ai_usage_daily TO service_role;

ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage (for UI quota indicators if needed)
CREATE POLICY "Users view own ai usage"
  ON public.ai_usage_daily
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Writes happen only via SECURITY DEFINER RPC below; no client INSERT/UPDATE policy.

-- Atomic increment + quota check. Returns row with allowed/limit/count.
CREATE OR REPLACE FUNCTION public.increment_ai_usage(
  p_route TEXT,
  p_limit INTEGER
)
RETURNS TABLE(allowed BOOLEAN, current_count INTEGER, daily_limit INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_today DATE := (now() AT TIME ZONE 'UTC')::date;
  v_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO public.ai_usage_daily (user_id, usage_date, route, count, updated_at)
  VALUES (v_uid, v_today, p_route, 1, now())
  ON CONFLICT (user_id, usage_date, route) DO UPDATE
    SET count = ai_usage_daily.count + 1,
        updated_at = now()
  RETURNING count INTO v_count;

  RETURN QUERY SELECT (v_count <= p_limit), v_count, p_limit;
END;
$$;

-- Cleanup older than 30 days
CREATE OR REPLACE FUNCTION public.cleanup_old_ai_usage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.ai_usage_daily
  WHERE usage_date < (now() AT TIME ZONE 'UTC')::date - interval '30 days';
END;
$$;
