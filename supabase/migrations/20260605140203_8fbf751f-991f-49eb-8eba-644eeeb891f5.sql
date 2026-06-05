-- Helper: ISO week label (YYYY-Www) from timestamp
CREATE OR REPLACE FUNCTION public.iso_week_label(p_ts timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT to_char(p_ts AT TIME ZONE 'UTC', 'IYYY-"W"IW');
$$;

-- Admin guard helper (raises if not admin)
CREATE OR REPLACE FUNCTION public._require_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin only' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Cohort retention: per cohort week × week_offset 0..7
-- Active in week N = >=1 expense insert (excluding correction nature) where
-- floor( (date_trunc('week', created_at) - cohort_week_start) / 7 days ) = N
CREATE OR REPLACE FUNCTION public.admin_get_cohort_retention()
RETURNS TABLE (
  cohort_week text,
  cohort_week_start date,
  cohort_size integer,
  week_offset integer,
  retained_count integer,
  retained_pct numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._require_admin();

  RETURN QUERY
  WITH cohorts AS (
    SELECT
      u.id AS user_id,
      date_trunc('week', u.created_at AT TIME ZONE 'UTC')::date AS cohort_start
    FROM auth.users u
    WHERE u.created_at >= now() - interval '180 days'
  ),
  cohort_sizes AS (
    SELECT cohort_start, COUNT(*)::int AS size
    FROM cohorts
    GROUP BY cohort_start
  ),
  activity AS (
    SELECT
      c.cohort_start,
      c.user_id,
      GREATEST(
        0,
        FLOOR(
          EXTRACT(EPOCH FROM (date_trunc('week', e.created_at AT TIME ZONE 'UTC')::date - c.cohort_start))
          / (7 * 86400)
        )::int
      ) AS w_off
    FROM cohorts c
    JOIN public.expenses e ON e.user_id = c.user_id
    WHERE COALESCE(e.expense_nature, '') <> 'correction'
      AND e.created_at >= c.cohort_start
      AND e.created_at < c.cohort_start + interval '8 weeks'
  ),
  retained AS (
    SELECT cohort_start, w_off, COUNT(DISTINCT user_id)::int AS cnt
    FROM activity
    WHERE w_off BETWEEN 0 AND 7
    GROUP BY cohort_start, w_off
  ),
  weeks AS (
    SELECT generate_series(0, 7) AS w_off
  ),
  grid AS (
    SELECT cs.cohort_start, cs.size, w.w_off
    FROM cohort_sizes cs
    CROSS JOIN weeks w
  )
  SELECT
    to_char(g.cohort_start, 'IYYY-"W"IW') AS cohort_week,
    g.cohort_start AS cohort_week_start,
    g.size AS cohort_size,
    g.w_off AS week_offset,
    COALESCE(r.cnt, 0) AS retained_count,
    CASE WHEN g.size > 0
      THEN ROUND((COALESCE(r.cnt, 0)::numeric / g.size::numeric) * 100, 1)
      ELSE 0
    END AS retained_pct
  FROM grid g
  LEFT JOIN retained r
    ON r.cohort_start = g.cohort_start AND r.w_off = g.w_off
  ORDER BY g.cohort_start DESC, g.w_off ASC;
END;
$$;

-- Activation by cohort + median expenses per active user
CREATE OR REPLACE FUNCTION public.admin_get_activation_by_cohort()
RETURNS TABLE (
  cohort_week text,
  cohort_week_start date,
  cohort_size integer,
  activated_count integer,
  activated_pct numeric,
  median_expenses_per_active numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._require_admin();

  RETURN QUERY
  WITH cohorts AS (
    SELECT
      u.id AS user_id,
      date_trunc('week', u.created_at AT TIME ZONE 'UTC')::date AS cohort_start
    FROM auth.users u
    WHERE u.created_at >= now() - interval '180 days'
  ),
  expense_counts AS (
    SELECT
      c.cohort_start,
      c.user_id,
      COUNT(e.id)::int AS exp_cnt
    FROM cohorts c
    LEFT JOIN public.expenses e
      ON e.user_id = c.user_id
     AND COALESCE(e.expense_nature, '') <> 'correction'
    GROUP BY c.cohort_start, c.user_id
  ),
  agg AS (
    SELECT
      cohort_start,
      COUNT(*)::int AS cohort_size,
      COUNT(*) FILTER (WHERE exp_cnt >= 3)::int AS activated_count,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY exp_cnt)
        FILTER (WHERE exp_cnt >= 3) AS median_active
    FROM expense_counts
    GROUP BY cohort_start
  )
  SELECT
    to_char(a.cohort_start, 'IYYY-"W"IW') AS cohort_week,
    a.cohort_start AS cohort_week_start,
    a.cohort_size,
    a.activated_count,
    CASE WHEN a.cohort_size > 0
      THEN ROUND((a.activated_count::numeric / a.cohort_size::numeric) * 100, 1)
      ELSE 0
    END AS activated_pct,
    COALESCE(ROUND(a.median_active::numeric, 1), 0) AS median_expenses_per_active
  FROM agg a
  ORDER BY a.cohort_start DESC;
END;
$$;

-- Funnel summary for last 30 days (per day per event)
CREATE OR REPLACE FUNCTION public.admin_get_funnel_summary_30d()
RETURNS TABLE (
  day date,
  event_name text,
  cnt integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._require_admin();

  RETURN QUERY
  SELECT
    (fe.occurred_at AT TIME ZONE 'UTC')::date AS day,
    fe.event_name::text,
    COUNT(*)::int AS cnt
  FROM public.funnel_events fe
  WHERE fe.occurred_at >= now() - interval '30 days'
    AND fe.event_name IN (
      'install',
      'signup',
      'onboarding_complete',
      'first_transaction',
      'day7_active',
      'paid_conversion'
    )
  GROUP BY 1, 2
  ORDER BY 1 ASC, 2 ASC;
END;
$$;

-- Purge old funnel events
CREATE OR REPLACE FUNCTION public.admin_purge_old_funnel_events(p_days integer DEFAULT 365)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted bigint;
BEGIN
  PERFORM public._require_admin();

  IF p_days < 30 THEN
    RAISE EXCEPTION 'p_days must be >= 30';
  END IF;

  DELETE FROM public.funnel_events
  WHERE occurred_at < now() - (p_days || ' days')::interval;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.admin_get_cohort_retention() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_activation_by_cohort() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_funnel_summary_30d() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_purge_old_funnel_events(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._require_admin() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_get_cohort_retention() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_activation_by_cohort() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_funnel_summary_30d() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_purge_old_funnel_events(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iso_week_label(timestamptz) TO authenticated, service_role;