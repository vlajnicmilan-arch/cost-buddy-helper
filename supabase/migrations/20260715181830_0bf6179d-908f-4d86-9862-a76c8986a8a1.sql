-- Hotfix: ON CONFLICT ne može uparivati parcijalni indeks (uniq_project_milestone_source_decision
-- ima WHERE source_decision_id IS NOT NULL AND deleted_at IS NULL). Zamjena: IF NOT EXISTS +
-- EXCEPTION unique_violation kao zadnja linija obrane od utrke. Ostatak triggera netaknut.

CREATE OR REPLACE FUNCTION public.project_decision_step_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_next_sort int;
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
         updated_at     = now()
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

      -- Faza 7 — automatska nova faza iz odluke, samo za POZITIVNU cijenu.
      -- HOTFIX: eksplicitna IF NOT EXISTS provjera (parcijalni unique indeks nekompatibilan s
      -- ON CONFLICT). EXCEPTION unique_violation hvata race-condition kao zadnju liniju obrane.
      IF v_effective_price > 0 THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.project_milestones
           WHERE source_decision_id = v_decision.id
             AND deleted_at IS NULL
        ) THEN
          SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_next_sort
            FROM public.project_milestones
           WHERE project_id = v_decision.project_id;

          BEGIN
            INSERT INTO public.project_milestones (
              project_id, name, description, budget, status, sort_order,
              color, reminder_days_before, is_contingency, is_vtr,
              source_decision_id, investor_price
            ) VALUES (
              v_decision.project_id,
              v_decision.title,
              v_decision.initial_description,
              0,
              'pending',
              v_next_sort,
              '#3b82f6',
              3,
              false,
              false,
              v_decision.id,
              v_effective_price
            );
          EXCEPTION WHEN unique_violation THEN
            -- Race: druga transakcija je već stvorila fazu za istu odluku. Ignoriramo.
            NULL;
          END;
        END IF;
      END IF;
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

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.project_decision_step_after() FROM anon, public;