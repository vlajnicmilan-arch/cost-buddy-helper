-- Profiles: timezone i preferirani jezik
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/Zagreb',
  ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'hr';

-- Notification preferences: dnevni sažetak
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS daily_summary_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_summary_weekend_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_summary_last_sent_on DATE,
  ADD COLUMN IF NOT EXISTS daily_summary_paused_until DATE,
  ADD COLUMN IF NOT EXISTS daily_summary_unopened_streak INT NOT NULL DEFAULT 0;

-- Ažuriraj is_push_category_enabled da prepozna 'daily_summary'
CREATE OR REPLACE FUNCTION public.is_push_category_enabled(_user_id uuid, _category text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pref RECORD;
BEGIN
  SELECT * INTO v_pref FROM public.notification_preferences WHERE user_id = _user_id;
  IF NOT FOUND THEN
    RETURN true; -- default ON
  END IF;

  RETURN CASE _category
    WHEN 'chat'          THEN v_pref.chat_enabled
    WHEN 'transactions'  THEN v_pref.transactions_enabled
    WHEN 'pending'       THEN v_pref.pending_enabled
    WHEN 'projects'      THEN v_pref.projects_enabled
    WHEN 'budgets'       THEN v_pref.budgets_enabled
    WHEN 'reminders'     THEN v_pref.reminders_enabled
    WHEN 'trial'         THEN v_pref.trial_enabled
    WHEN 'broadcast'     THEN v_pref.broadcast_enabled
    WHEN 'daily_summary' THEN v_pref.daily_summary_enabled
    ELSE true
  END;
END;
$function$;