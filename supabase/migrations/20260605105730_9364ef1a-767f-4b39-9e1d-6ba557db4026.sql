ALTER TABLE public.funnel_events DROP CONSTRAINT IF EXISTS funnel_events_name_check;

ALTER TABLE public.funnel_events ADD CONSTRAINT funnel_events_name_check
  CHECK (event_name = ANY (ARRAY[
    'install'::text,
    'signup'::text,
    'onboarding_complete'::text,
    'first_transaction'::text,
    'day7_active'::text,
    'paid_conversion'::text,
    'manual_merge_used'::text,
    'onboarding_started'::text,
    'onboarding_step_viewed'::text,
    'onboarding_step_completed'::text,
    'onboarding_step_skipped'::text,
    'onboarding_abandoned'::text,
    'checklist_viewed'::text,
    'checklist_step_clicked'::text,
    'checklist_dismissed'::text,
    'checklist_completed'::text
  ]));