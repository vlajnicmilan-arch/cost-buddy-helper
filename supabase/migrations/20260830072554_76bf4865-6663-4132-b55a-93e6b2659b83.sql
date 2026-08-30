ALTER TABLE public.funnel_events DROP CONSTRAINT IF EXISTS funnel_events_name_check;
ALTER TABLE public.funnel_events ADD CONSTRAINT funnel_events_name_check
  CHECK (event_name = ANY (ARRAY[
    'install','signup','onboarding_complete','first_transaction','day7_active',
    'paid_conversion','manual_merge_used','onboarding_started','onboarding_step_viewed',
    'onboarding_step_completed','onboarding_step_skipped','onboarding_abandoned',
    'checklist_viewed','checklist_step_clicked','checklist_dismissed','checklist_completed',
    'import_undone',
    'auth_page_viewed','signup_form_started','signup_submitted','signup_failed',
    'login_attempted','login_failed','apk_download_started','apk_download_failed',
    'invite_opened','invite_accepted','invite_failed'
  ]));

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
      'apk_download_failed',
      'invite_opened',
      'invite_failed'
    ])
  )
  OR (user_id IS NOT NULL AND user_id = auth.uid())
);