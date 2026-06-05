DROP FUNCTION IF EXISTS public.admin_get_cohort_retention();

CREATE FUNCTION public.admin_get_cohort_retention()
RETURNS TABLE (
  cohort_week text,
  cohort_week_start date,
  cohort_size int,
  w0 int, w1 int, w2 int, w3 int, w4 int, w5 int, w6 int, w7 int
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
        ((date_trunc('week', e.created_at AT TIME ZONE 'UTC')::date - c.cohort_start) / 7)::int
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
    COALESCE(MAX(CASE WHEN g.w_off = 0 THEN r.cnt END), 0)::int AS w0,
    COALESCE(MAX(CASE WHEN g.w_off = 1 THEN r.cnt END), 0)::int AS w1,
    COALESCE(MAX(CASE WHEN g.w_off = 2 THEN r.cnt END), 0)::int AS w2,
    COALESCE(MAX(CASE WHEN g.w_off = 3 THEN r.cnt END), 0)::int AS w3,
    COALESCE(MAX(CASE WHEN g.w_off = 4 THEN r.cnt END), 0)::int AS w4,
    COALESCE(MAX(CASE WHEN g.w_off = 5 THEN r.cnt END), 0)::int AS w5,
    COALESCE(MAX(CASE WHEN g.w_off = 6 THEN r.cnt END), 0)::int AS w6,
    COALESCE(MAX(CASE WHEN g.w_off = 7 THEN r.cnt END), 0)::int AS w7
  FROM grid g
  LEFT JOIN retained r
    ON r.cohort_start = g.cohort_start AND r.w_off = g.w_off
  GROUP BY g.cohort_start, g.size
  ORDER BY g.cohort_start DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_cohort_retention() TO authenticated, service_role;