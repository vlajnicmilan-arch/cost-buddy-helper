
-- Per-category push notification preferences
-- Each user has 1 row; missing row = all categories enabled (default ON)

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  -- Categories — boolean per push type emitted by edge functions
  chat_enabled BOOLEAN NOT NULL DEFAULT true,                    -- family chat / project notes
  transactions_enabled BOOLEAN NOT NULL DEFAULT true,            -- shared payment source / project tx
  pending_enabled BOOLEAN NOT NULL DEFAULT true,                 -- pending approvals + auto-reject
  projects_enabled BOOLEAN NOT NULL DEFAULT true,                -- project invitations / member changes
  budgets_enabled BOOLEAN NOT NULL DEFAULT true,                 -- budget alerts + thresholds
  reminders_enabled BOOLEAN NOT NULL DEFAULT true,               -- calendar reminders + milestone deadlines
  trial_enabled BOOLEAN NOT NULL DEFAULT true,                   -- trial / subscription reminders
  broadcast_enabled BOOLEAN NOT NULL DEFAULT true,               -- admin broadcasts (always recommend ON)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notification preferences"
  ON public.notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own notification preferences"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own notification preferences"
  ON public.notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own notification preferences"
  ON public.notification_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at trigger
CREATE TRIGGER trg_notification_preferences_updated
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Server-side helper used by send-push to check whether a category is enabled.
-- Default: if no row exists, treat as ENABLED (true). This keeps existing users
-- on full notifications until they explicitly turn something off.
CREATE OR REPLACE FUNCTION public.is_push_category_enabled(_user_id UUID, _category TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pref RECORD;
BEGIN
  SELECT * INTO v_pref FROM public.notification_preferences WHERE user_id = _user_id;
  IF NOT FOUND THEN
    RETURN true; -- default ON
  END IF;

  RETURN CASE _category
    WHEN 'chat'         THEN v_pref.chat_enabled
    WHEN 'transactions' THEN v_pref.transactions_enabled
    WHEN 'pending'      THEN v_pref.pending_enabled
    WHEN 'projects'     THEN v_pref.projects_enabled
    WHEN 'budgets'      THEN v_pref.budgets_enabled
    WHEN 'reminders'    THEN v_pref.reminders_enabled
    WHEN 'trial'        THEN v_pref.trial_enabled
    WHEN 'broadcast'    THEN v_pref.broadcast_enabled
    ELSE true -- unknown category → allow
  END;
END;
$$;
