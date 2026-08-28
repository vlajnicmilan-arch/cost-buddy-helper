CREATE TABLE IF NOT EXISTS public.landing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'page_view', 'section_view', 'cta_click', 'link_click',
    'scroll_depth', 'lang_change', 'theme_change', 'time_on_page'
  )),
  target text,
  value integer,
  lang text,
  theme text,
  platform text,
  path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landing_events_occurred_at ON public.landing_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_landing_events_type_target ON public.landing_events (event_type, target);

GRANT INSERT ON public.landing_events TO anon;
GRANT INSERT, SELECT ON public.landing_events TO authenticated;
GRANT ALL ON public.landing_events TO service_role;

ALTER TABLE public.landing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert landing events" ON public.landing_events;
CREATE POLICY "Anyone can insert landing events"
  ON public.landing_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can read landing events" ON public.landing_events;
CREATE POLICY "Admins can read landing events"
  ON public.landing_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.get_landing_event_stats(p_days integer DEFAULT 7)
RETURNS TABLE (
  event_type text,
  target text,
  hits bigint,
  unique_sessions bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT le.event_type,
         COALESCE(le.target, '') AS target,
         count(*)::bigint AS hits,
         count(DISTINCT le.session_id)::bigint AS unique_sessions
  FROM public.landing_events le
  WHERE public.has_role(auth.uid(), 'admin')
    AND le.occurred_at >= now() - make_interval(days => GREATEST(p_days, 1))
  GROUP BY 1, 2
  ORDER BY hits DESC
$$;

REVOKE ALL ON FUNCTION public.get_landing_event_stats(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_landing_event_stats(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_landing_event_stats(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_landing_overview(p_days integer DEFAULT 7)
RETURNS TABLE (
  sessions bigint,
  page_views bigint,
  cta_sessions bigint,
  scroll50_sessions bigint,
  scroll100_sessions bigint,
  median_seconds integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH src AS (
    SELECT * FROM public.landing_events
    WHERE public.has_role(auth.uid(), 'admin')
      AND occurred_at >= now() - make_interval(days => GREATEST(p_days, 1))
  )
  SELECT
    (SELECT count(DISTINCT session_id) FROM src)::bigint,
    (SELECT count(*) FROM src WHERE event_type = 'page_view')::bigint,
    (SELECT count(DISTINCT session_id) FROM src WHERE event_type = 'cta_click')::bigint,
    (SELECT count(DISTINCT session_id) FROM src WHERE event_type = 'scroll_depth' AND value >= 50)::bigint,
    (SELECT count(DISTINCT session_id) FROM src WHERE event_type = 'scroll_depth' AND value >= 100)::bigint,
    COALESCE((
      SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY value)
      FROM src WHERE event_type = 'time_on_page' AND value IS NOT NULL
    ), 0)::integer
$$;

REVOKE ALL ON FUNCTION public.get_landing_overview(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_landing_overview(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_landing_overview(integer) TO authenticated;