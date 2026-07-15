
-- Faza 4: rok za odgovor + mail sažetak na zatvaranju

-- 1) Kolone za rok i podsjetnike
ALTER TABLE public.project_decisions
  ADD COLUMN IF NOT EXISTS overdue boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_project_decisions_awaiting_updated
  ON public.project_decisions(updated_at)
  WHERE current_status = 'awaiting_response';

-- 2) Notification prefs — nova kategorija 'decisions'
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS decisions_enabled boolean NOT NULL DEFAULT true;

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
    RETURN true;
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
    WHEN 'krug'          THEN v_pref.krug_enabled
    WHEN 'decisions'     THEN v_pref.decisions_enabled
    ELSE true
  END;
END;
$function$;

-- 3) After-trigger: nakon svakog koraka resetiraj overdue/last_reminder_sent_at.
--    Kod zatvaranja (approved/rejected/closed) okini notify-decision-closed
--    (fire-and-forget net.http_post) da posalje mail objema stranama.
CREATE OR REPLACE FUNCTION public.project_decision_step_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_decision public.project_decisions%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_investor_id uuid;
  v_recipient_id uuid;
  v_next_status text;
  v_closed_reason text;
  v_effective_price numeric(14,2);
  v_amendment_id uuid;
  v_cv numeric;
  v_tb numeric;
  v_baseline numeric;
  v_new_contract numeric;
  v_notify_url text := 'https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/notify-decision-closed';
  v_apikey text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6YWx4anJldHZ0dm9raW90dmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMjczNDMsImV4cCI6MjA4NDYwMzM0M30.NKPTQ5hJnMt7M17NUPLNU07CQ3EFZZpOrE2ZQvuEtTw';
BEGIN
  SELECT * INTO v_decision FROM public.project_decisions WHERE id = NEW.decision_id;
  SELECT * INTO v_project  FROM public.projects WHERE id = v_decision.project_id;
  SELECT user_id INTO v_investor_id
    FROM public.project_members
    WHERE project_id = v_decision.project_id AND role = 'investor'
    LIMIT 1;

  IF NEW.action = 'accept' THEN
    v_next_status := 'approved'; v_closed_reason := 'accepted';
  ELSIF NEW.action = 'reject' THEN
    v_next_status := 'rejected'; v_closed_reason := 'rejected';
  ELSE
    v_next_status := 'awaiting_response'; v_closed_reason := NULL;
  END IF;

  UPDATE public.project_decisions
     SET current_status = v_next_status,
         closed_reason  = COALESCE(v_closed_reason, closed_reason),
         closed_at      = CASE WHEN v_next_status IN ('approved','rejected','closed')
                                 THEN COALESCE(closed_at, now()) ELSE closed_at END,
         updated_at     = now(),
         -- Novi korak = svježa aktivnost → reset roka i podsjetnika
         overdue        = false,
         last_reminder_sent_at = NULL
   WHERE id = NEW.decision_id;

  IF NEW.action = 'accept' AND v_decision.contract_amendment_id IS NULL THEN
    SELECT price INTO v_effective_price
      FROM public.project_decision_steps
      WHERE decision_id = NEW.decision_id
        AND price IS NOT NULL
      ORDER BY step_no DESC
      LIMIT 1;

    IF v_effective_price IS NOT NULL AND v_effective_price <> 0 THEN
      PERFORM set_config('app.allow_contract_baseline_write', 'on', true);

      INSERT INTO public.project_contract_amendments (
        project_id, user_id, amendment_amount, note, source_decision_id
      ) VALUES (
        v_decision.project_id,
        NEW.actor_user_id,
        v_effective_price,
        'Iz Odluke: ' || v_decision.title,
        v_decision.id
      )
      RETURNING id INTO v_amendment_id;

      SELECT contract_value, total_budget INTO v_cv, v_tb
        FROM public.projects WHERE id = v_decision.project_id;
      v_baseline := CASE WHEN COALESCE(v_cv, 0) > 0 THEN v_cv ELSE COALESCE(v_tb, 0) END;
      v_new_contract := GREATEST(v_baseline + v_effective_price, 0);

      UPDATE public.projects
         SET contract_value = v_new_contract
       WHERE id = v_decision.project_id;

      PERFORM set_config('app.allow_contract_baseline_write', 'off', true);

      UPDATE public.project_decisions
         SET contract_amendment_id = v_amendment_id
       WHERE id = v_decision.id;
    END IF;
  END IF;

  IF NEW.actor_user_id = v_project.user_id THEN
    v_recipient_id := v_investor_id;
  ELSE
    v_recipient_id := v_project.user_id;
  END IF;

  IF v_recipient_id IS NOT NULL AND v_recipient_id <> NEW.actor_user_id THEN
    INSERT INTO public.notifications (
      user_id, type, title, message, data, entity_type, entity_id, severity
    ) VALUES (
      v_recipient_id,
      'decision_step',
      v_decision.title,
      NEW.action,
      jsonb_build_object(
        'project_id', v_decision.project_id,
        'project_name', v_project.name,
        'decision_id', v_decision.id,
        'decision_title', v_decision.title,
        'action', NEW.action,
        'step_no', NEW.step_no,
        'new_status', v_next_status,
        'price', NEW.price,
        'amendment_id', v_amendment_id
      ),
      'project_decision',
      v_decision.id,
      CASE WHEN v_next_status IN ('approved','rejected') THEN 'warning' ELSE 'info' END
    );
  END IF;

  -- Mail sažetak na zatvaranju: fire-and-forget prema notify-decision-closed
  IF v_next_status IN ('approved','rejected','closed') THEN
    BEGIN
      PERFORM net.http_post(
        url := v_notify_url,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'apikey', v_apikey,
          'Authorization', 'Bearer ' || v_apikey
        ),
        body := jsonb_build_object(
          'decision_id', v_decision.id,
          'triggered_at', now()
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify-decision-closed dispatch failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.project_decision_step_after() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.project_decision_step_after() TO service_role;
