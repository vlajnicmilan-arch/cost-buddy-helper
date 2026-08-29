-- 1) landing_events: allow the new page_ready event type
ALTER TABLE public.landing_events DROP CONSTRAINT IF EXISTS landing_events_event_type_check;
ALTER TABLE public.landing_events ADD CONSTRAINT landing_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'page_view','section_view','cta_click','link_click',
    'scroll_depth','lang_change','theme_change','time_on_page','page_ready'
  ]));

-- 2) funnel_events: allow anonymous (pre-auth) acquisition events, not just 'install'
DROP POLICY IF EXISTS "Anyone can insert funnel events" ON public.funnel_events;
CREATE POLICY "Anyone can insert funnel events"
ON public.funnel_events
FOR INSERT
WITH CHECK (
  (
    user_id IS NULL
    AND event_name = ANY (ARRAY[
      'install',
      'auth_page_viewed',
      'signup_form_started',
      'signup_submitted',
      'signup_failed',
      'login_attempted',
      'login_failed',
      'apk_download_started',
      'apk_download_failed'
    ])
  )
  OR (user_id IS NOT NULL AND user_id = auth.uid())
);