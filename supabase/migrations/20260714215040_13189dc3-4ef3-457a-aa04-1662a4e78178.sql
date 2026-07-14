
-- ============================================================================
-- Modul "Odluke" — Faza 1 (MVP)
-- ============================================================================

-- 1) Proširi CHECK constraint za 'investor' rolu na members + invitations
ALTER TABLE public.project_members DROP CONSTRAINT IF EXISTS project_members_role_check;
ALTER TABLE public.project_members ADD CONSTRAINT project_members_role_check
  CHECK (role = ANY (ARRAY['member'::text, 'viewer'::text, 'worker'::text, 'investor'::text]));

ALTER TABLE public.project_invitations DROP CONSTRAINT IF EXISTS project_invitations_role_check;
ALTER TABLE public.project_invitations ADD CONSTRAINT project_invitations_role_check
  CHECK (role = ANY (ARRAY['member'::text, 'viewer'::text, 'worker'::text, 'investor'::text]));

-- Guard: max 1 aktivan investor po projektu
CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_investor_singleton
  ON public.project_members (project_id)
  WHERE role = 'investor';

-- ============================================================================
-- 2) Tablice
-- ============================================================================

CREATE TABLE public.project_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  initial_description text NOT NULL CHECK (length(btrim(initial_description)) > 0),
  -- Faza 2 kolona; UI je ne koristi u MVP-u
  initial_price numeric(14,2),
  current_status text NOT NULL DEFAULT 'awaiting_response'
    CHECK (current_status = ANY (ARRAY['awaiting_response','approved','rejected','closed'])),
  closed_reason text CHECK (closed_reason IS NULL OR closed_reason = ANY (ARRAY['accepted','rejected','cycle_exhausted'])),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_decisions_project ON public.project_decisions(project_id, created_at DESC);
CREATE INDEX idx_project_decisions_status ON public.project_decisions(project_id, current_status);

CREATE TABLE public.project_decision_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES public.project_decisions(id) ON DELETE CASCADE,
  step_no integer NOT NULL CHECK (step_no BETWEEN 1 AND 4),
  actor_user_id uuid NOT NULL,
  actor_role text NOT NULL CHECK (actor_role = ANY (ARRAY['owner','investor'])),
  action text NOT NULL CHECK (action = ANY (ARRAY['propose','counter','correction','accept','reject'])),
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (decision_id, step_no)
);

CREATE INDEX idx_project_decision_steps_decision ON public.project_decision_steps(decision_id, step_no);

-- ============================================================================
-- 3) GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_decisions TO authenticated;
GRANT ALL ON public.project_decisions TO service_role;

GRANT SELECT, INSERT ON public.project_decision_steps TO authenticated;
GRANT ALL ON public.project_decision_steps TO service_role;

-- ============================================================================
-- 4) Security-definer helper: is_project_decision_party
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_project_decision_party(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _project_id IS NULL OR _user_id IS NULL THEN
    RETURN false;
  END IF;
  -- Vlasnik projekta
  IF EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = _user_id) THEN
    RETURN true;
  END IF;
  -- Investitor
  IF EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id AND user_id = _user_id AND role = 'investor'
  ) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.is_project_decision_party(uuid, uuid) FROM anon;

-- ============================================================================
-- 5) RLS — samo vlasnik + investitor
-- ============================================================================

ALTER TABLE public.project_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Decision parties can view decisions"
  ON public.project_decisions FOR SELECT
  TO authenticated
  USING (public.is_project_decision_party(project_id, auth.uid()));

CREATE POLICY "Decision parties can create decisions"
  ON public.project_decisions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_project_decision_party(project_id, auth.uid())
    AND created_by = auth.uid()
  );

-- UPDATE ide isključivo kroz trigger nakon INSERT step-a (status/closed_*).
-- Direktni UPDATE od klijenta blokiran je jer nema policy za UPDATE.
-- DELETE zabranjen na razini politika (nema policy).

ALTER TABLE public.project_decision_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Decision parties can view steps"
  ON public.project_decision_steps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_decisions d
      WHERE d.id = decision_id
        AND public.is_project_decision_party(d.project_id, auth.uid())
    )
  );

CREATE POLICY "Decision parties can insert steps"
  ON public.project_decision_steps FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.project_decisions d
      WHERE d.id = decision_id
        AND public.is_project_decision_party(d.project_id, auth.uid())
    )
  );

-- Nema UPDATE ni DELETE polica — append-only.

-- ============================================================================
-- 6) Guard: append-only na project_decision_steps
-- ============================================================================

CREATE OR REPLACE FUNCTION public.project_decision_steps_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'project_decision_steps is append-only (%)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER trg_project_decision_steps_no_update
  BEFORE UPDATE ON public.project_decision_steps
  FOR EACH ROW EXECUTE FUNCTION public.project_decision_steps_block_mutation();

CREATE TRIGGER trg_project_decision_steps_no_delete
  BEFORE DELETE ON public.project_decision_steps
  FOR EACH ROW EXECUTE FUNCTION public.project_decision_steps_block_mutation();

-- ============================================================================
-- 7) State-machine trigger: validira tranziciju i ažurira status odluke
-- ============================================================================

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
  v_next_closed_reason text;
BEGIN
  -- Učitaj odluku
  SELECT * INTO v_decision FROM public.project_decisions WHERE id = NEW.decision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision_not_found';
  END IF;

  -- Odluka mora biti otvorena
  IF v_decision.current_status <> 'awaiting_response' THEN
    RAISE EXCEPTION 'decision_closed'
      USING HINT = 'Odluka je zatvorena i ne prima nove korake.';
  END IF;

  -- Utvrdi vlasnika i (opcionalno) investitora projekta
  SELECT user_id INTO v_project_owner_id FROM public.projects WHERE id = v_decision.project_id;
  SELECT user_id INTO v_investor_id
    FROM public.project_members
    WHERE project_id = v_decision.project_id AND role = 'investor'
    LIMIT 1;

  -- Actor mora biti stranka
  IF NEW.actor_user_id = v_project_owner_id THEN
    v_actor_role := 'owner';
  ELSIF v_investor_id IS NOT NULL AND NEW.actor_user_id = v_investor_id THEN
    v_actor_role := 'investor';
  ELSE
    RAISE EXCEPTION 'actor_not_party'
      USING HINT = 'Samo vlasnik i investitor mogu djelovati na odluci.';
  END IF;

  -- Prisili actor_role u INSERT-u da odgovara stvarnoj ulozi
  NEW.actor_role := v_actor_role;

  -- Odredi zadnji korak
  SELECT action, actor_user_id, step_no
    INTO v_prev_action, v_prev_actor, v_expected_step
    FROM public.project_decision_steps
    WHERE decision_id = NEW.decision_id
    ORDER BY step_no DESC
    LIMIT 1;

  IF NOT FOUND THEN
    -- Prvi korak
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

    -- Actor mora biti "the other party" osim kod korekcije (istog stvaratelja)
    IF NEW.action = 'correction' THEN
      -- Korekciju šalje ORIGINALNI predlagač = created_by
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
      -- accept / reject / counter — mora biti druga strana
      IF NEW.actor_user_id = v_prev_actor THEN
        RAISE EXCEPTION 'must_be_other_party'
          USING HINT = 'Odgovor mora poslati druga strana.';
      END IF;

      -- Legalne akcije po koraku
      IF v_expected_step = 2 THEN
        -- Odgovor na propose: accept | reject | counter
        IF NEW.action NOT IN ('accept','reject','counter') THEN
          RAISE EXCEPTION 'illegal_action_step2';
        END IF;
      ELSIF v_expected_step = 4 THEN
        -- Konačni krug — samo accept | reject (counter zabranjen)
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
        v_next_closed_reason := 'accepted';
      ELSIF NEW.action = 'reject' THEN
        v_next_status := 'rejected';
        v_next_closed_reason := 'rejected';
      ELSE
        v_next_status := 'awaiting_response';
      END IF;
    END IF;
  END IF;

  -- Postavi step_no (server-authoritative)
  NEW.step_no := v_expected_step;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_decision_step_enforce
  BEFORE INSERT ON public.project_decision_steps
  FOR EACH ROW EXECUTE FUNCTION public.project_decision_step_enforce();

-- After-insert: ažuriraj status + zabilježi notifikaciju drugoj strani
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
BEGIN
  SELECT * INTO v_decision FROM public.project_decisions WHERE id = NEW.decision_id;
  SELECT * INTO v_project  FROM public.projects WHERE id = v_decision.project_id;
  SELECT user_id INTO v_investor_id
    FROM public.project_members
    WHERE project_id = v_decision.project_id AND role = 'investor'
    LIMIT 1;

  -- Izračunaj novi status iz akcije (mirror trigger enforce)
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

  -- Odredi primatelja notifikacije = druga strana
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
        'new_status', v_next_status
      ),
      'project_decision',
      v_decision.id,
      CASE WHEN v_next_status IN ('approved','rejected') THEN 'warning' ELSE 'info' END
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_decision_step_after
  AFTER INSERT ON public.project_decision_steps
  FOR EACH ROW EXECUTE FUNCTION public.project_decision_step_after();

-- updated_at trigger za odluke (koristi postojeći tickle pattern, no dependency)
CREATE OR REPLACE FUNCTION public.project_decisions_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_project_decisions_updated_at
  BEFORE UPDATE ON public.project_decisions
  FOR EACH ROW EXECUTE FUNCTION public.project_decisions_touch_updated_at();
