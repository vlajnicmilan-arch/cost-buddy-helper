CREATE OR REPLACE FUNCTION public.get_dashboard_section_stats(p_days integer DEFAULT 14)
RETURNS TABLE(
  section text,
  views bigint,
  clicks bigint,
  unique_users bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    dt.section,
    COUNT(*) FILTER (WHERE dt.event_type = 'section_view')::bigint AS views,
    COUNT(*) FILTER (WHERE dt.event_type = 'section_click')::bigint AS clicks,
    COUNT(DISTINCT dt.user_id) FILTER (WHERE dt.event_type = 'section_view')::bigint AS unique_users
  FROM public.dashboard_telemetry dt
  WHERE dt.event_type IN ('section_view','section_click')
    AND dt.occurred_at >= now() - (p_days || ' days')::interval
  GROUP BY dt.section
  ORDER BY views DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_scroll_distribution(p_days integer DEFAULT 14)
RETURNS TABLE(
  depth integer,
  hits bigint,
  unique_users bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    dt.value AS depth,
    COUNT(*)::bigint AS hits,
    COUNT(DISTINCT dt.user_id)::bigint AS unique_users
  FROM public.dashboard_telemetry dt
  WHERE dt.event_type = 'scroll_depth'
    AND dt.value IN (25,50,75,100)
    AND dt.occurred_at >= now() - (p_days || ' days')::interval
  GROUP BY dt.value
  ORDER BY dt.value ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_section_stats(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_scroll_distribution(integer) FROM anon;