-- Modul "Odluke" — Faza 2: cijena po koraku + automatski amendment na accept

ALTER TABLE public.project_decision_steps
  ADD COLUMN IF NOT EXISTS price numeric(14,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_decision_steps_price_not_zero'
  ) THEN
    ALTER TABLE public.project_decision_steps
      ADD CONSTRAINT project_decision_steps_price_not_zero
      CHECK (price IS NULL OR price <> 0);
  END IF;
END $$;

ALTER TABLE public.project_contract_amendments
  ADD COLUMN IF NOT EXISTS source_decision_id uuid
  REFERENCES public.project_decisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pca_source_decision
  ON public.project_contract_amendments(source_decision_id);

ALTER TABLE public.project_decisions
  ADD COLUMN IF NOT EXISTS contract_amendment_id uuid
  REFERENCES public.project_contract_amendments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_decision_amendment
  ON public.project_decisions(contract_amendment_id)
  WHERE contract_amendment_id IS NOT NULL;

-- Proširen enforce: accept/reject NE smiju nositi cijenu
CREATE OR REPLACE FUNCTION public.project_decision_step_enforce()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decision public.project_decisions%ROWTYPE;
  v_project_owner_id uuid;
  v_investor_id uuid;
  v_actor_role text;
  v_prev_action text;
  v_prev_actor uuid;
  v_expected_step int;
  v_next_status text;
BEGIN
  SELECT * INTO v_decision FROM public.project_decisions WHERE id = NEW.decision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision_not_found';
  END IF;

  IF v_decision.current_status <> 'awaiting_response' THEN
    RAISE EXCEPTION 'decision_closed'
      USING HINT = 'Odluka je zatvorena i ne prima nove korake.';
  END IF;

  SELECT user_id INTO v_project_owner_id FROM public.projects WHERE id = v_decision.project_id;
  SELECT user_id INTO v_investor_id
    FROM public.project_members
    WHERE project_id = v_decision.project_id AND role = 'investor'
    LIMIT 1;

  IF NEW.actor_user_id = v_project_owner_id THEN
    v_actor_role := 'owner';
  ELSIF v_investor_id IS NOT NULL AND NEW.actor_user_id = v_investor_id THEN
    v_actor_role := 'investor';
  ELSE
    RAISE EXCEPTION 'actor_not_party'
      USING HINT = 'Samo vlasnik i investitor mogu djelovati na odluci.';
  END IF;

  NEW.actor_role := v_actor_role;

  IF NEW.action IN ('accept','reject') AND NEW.price IS NOT NULL THEN
    RAISE EXCEPTION 'accept_reject_must_not_carry_price'
      USING HINT = 'Prihvat/odbijanje ne postavljaju cijenu — vrijedi zadnja ponuđena.';
  END IF;

  SELECT action, actor_user_id, step_no
    INTO v_prev_action, v_prev_actor, v_expected_step
    FROM public.project_decision_steps
    WHERE decision_id = NEW.decision_id
    ORDER BY step_no DESC
    LIMIT 1;

  IF NOT FOUND THEN
    v_expected_step := 1;
    IF NEW.action <> 'propose' THEN
      RAISE EXCEPTION 'illegal_first_action'
        USING HINT = 'Prvi korak mora biti prijedlog.';
    END IF;
    IF NEW.actor_user_id <> v_decision.created_by THEN
      RAISE EXCEPTION 'first_step_must_be_creator';
    END IF;
    v_next_status := 'awaiting_response';
  ELSE
    v_expected_step := v_expected_step + 1;

    IF NEW.action = 'correction' THEN
      IF NEW.actor_user_id <> v_decision.created_by THEN
        RAISE EXCEPTION 'correction_must_be_from_original_proposer';
      END IF;
      IF v_prev_action <> 'counter' THEN
        RAISE EXCEPTION 'correction_only_after_counter';
      END IF;
      IF v_expected_step <> 3 THEN
        RAISE EXCEPTION 'correction_wrong_step';
      END IF;
      v_next_status := 'awaiting_response';
    ELSE
      IF NEW.actor_user_id = v_prev_actor THEN
        RAISE EXCEPTION 'must_be_other_party'
          USING HINT = 'Odgovor mora poslati druga strana.';
      END IF;

      IF v_expected_step = 2 THEN
        IF NEW.action NOT IN ('accept','reject','counter') THEN
          RAISE EXCEPTION 'illegal_action_step2';
        END IF;
      ELSIF v_expected_step = 4 THEN
        IF NEW.action NOT IN ('accept','reject') THEN
          RAISE EXCEPTION 'illegal_action_step4'
            USING HINT = 'Konačna odluka: samo prihvati ili odbij.';
        END IF;
        IF v_prev_action <> 'correction' THEN
          RAISE EXCEPTION 'step4_requires_correction';
        END IF;
      ELSE
        RAISE EXCEPTION 'illegal_step_%', v_expected_step;
      END IF;

      IF NEW.action = 'accept' THEN
        v_next_status := 'approved';
      ELSIF NEW.action = 'reject' THEN
        v_next_status := 'rejected';
      ELSE
        v_next_status := 'awaiting_response';
      END IF;
    END IF;
  END IF;

  NEW.step_no := v_expected_step;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.project_decision_step_enforce() FROM anon, public;

-- Proširen after-trigger: kod accept-a stvara amendment (idempotentno)
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