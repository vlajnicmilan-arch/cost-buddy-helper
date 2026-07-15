
-- Faza 6: two-party consent za PONIŠTENJE i BRISANJE zatvorenih odluka
-- (isti duh kao Krug governance). Aktivne (awaiting_response) odluke se
-- rješavaju kroz normalan ciklus i NE mogu se poništavati/brisati.

-- =============================================================
-- 1) Annul kolone na project_decisions
-- =============================================================
ALTER TABLE public.project_decisions
  ADD COLUMN IF NOT EXISTS annulled_at       timestamptz,
  ADD COLUMN IF NOT EXISTS annulled_by       uuid,
  ADD COLUMN IF NOT EXISTS annul_request_id  uuid,
  ADD COLUMN IF NOT EXISTS annul_compensation_amendment_id uuid;

-- =============================================================
-- 2) Tablica zahtjeva (append-status: povijest se čuva kao status update)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.project_decision_admin_requests (
  id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  decision_id   uuid NOT NULL REFERENCES public.project_decisions(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('annul','delete')),
  status        text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','confirmed','declined','withdrawn')),
  requested_by  uuid NOT NULL,
  resolved_by   uuid,
  resolved_at   timestamptz,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pdar_pending_per_decision
  ON public.project_decision_admin_requests(decision_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_pdar_decision
  ON public.project_decision_admin_requests(decision_id, created_at DESC);

GRANT SELECT ON public.project_decision_admin_requests TO authenticated;
GRANT ALL ON public.project_decision_admin_requests TO service_role;

ALTER TABLE public.project_decision_admin_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parties can view decision admin requests"
  ON public.project_decision_admin_requests;
CREATE POLICY "Parties can view decision admin requests"
  ON public.project_decision_admin_requests
  FOR SELECT TO authenticated
  USING (public.is_project_decision_party(project_id, auth.uid()));
-- Sve DML ide ISKLJUČIVO kroz SECURITY DEFINER RPC-ove ispod; nema INSERT/UPDATE polica.

CREATE OR REPLACE FUNCTION public._pdar_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_pdar_touch_updated_at ON public.project_decision_admin_requests;
CREATE TRIGGER trg_pdar_touch_updated_at
  BEFORE UPDATE ON public.project_decision_admin_requests
  FOR EACH ROW EXECUTE FUNCTION public._pdar_touch_updated_at();

-- =============================================================
-- 3) Bypass za append-only trigger na koracima (potreban za DELETE odluke)
-- =============================================================
CREATE OR REPLACE FUNCTION public.project_decision_steps_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.allow_decision_step_mutation', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'project_decision_steps is append-only (%)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$function$;

-- =============================================================
-- 4) Notifikacijski trigger na admin_requests
--    (in-app notifikacije + best-effort push preko net.http_post → send-push)
-- =============================================================
CREATE OR REPLACE FUNCTION public.project_decision_admin_request_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_decision       public.project_decisions%ROWTYPE;
  v_project        public.projects%ROWTYPE;
  v_investor_id    uuid;
  v_other_party    uuid;
  v_recipient      uuid;
  v_event          text;
  v_send_url       text := 'https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/send-push';
  v_apikey         text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6YWx4anJldHZ0dm9raW90dmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMjczNDMsImV4cCI6MjA4NDYwMzM0M30.NKPTQ5hJnMt7M17NUPLNU07CQ3EFZZpOrE2ZQvuEtTw';
  v_push_body      text;
BEGIN
  SELECT * INTO v_decision FROM public.project_decisions WHERE id = NEW.decision_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO v_project  FROM public.projects WHERE id = v_decision.project_id;
  SELECT user_id INTO v_investor_id
    FROM public.project_members
    WHERE project_id = v_decision.project_id AND role = 'investor'
    LIMIT 1;

  v_other_party := CASE WHEN NEW.requested_by = v_project.user_id
                        THEN v_investor_id ELSE v_project.user_id END;

  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    v_event := 'requested';
    v_recipient := v_other_party;  -- druga strana treba potvrditi/odbiti
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status <> 'pending' THEN
    v_event := NEW.status;  -- 'confirmed'|'declined'|'withdrawn'
    -- Obavijesti drugu stranu (ne aktora koji je razriješio zahtjev)
    IF NEW.status = 'withdrawn' THEN
      v_recipient := v_other_party;
    ELSE
      v_recipient := NEW.requested_by;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF v_recipient IS NULL THEN RETURN NEW; END IF;

  v_push_body := CASE v_event
    WHEN 'requested'  THEN CASE NEW.type WHEN 'annul'  THEN 'Zahtjev za poništenje odluke čeka tvoju potvrdu.'
                                          WHEN 'delete' THEN 'Zahtjev za brisanje odluke čeka tvoju potvrdu.' END
    WHEN 'confirmed'  THEN CASE NEW.type WHEN 'annul'  THEN 'Poništenje odluke je potvrđeno.'
                                          WHEN 'delete' THEN 'Brisanje odluke je potvrđeno.' END
    WHEN 'declined'   THEN CASE NEW.type WHEN 'annul'  THEN 'Poništenje odluke je odbijeno.'
                                          WHEN 'delete' THEN 'Brisanje odluke je odbijeno.' END
    WHEN 'withdrawn'  THEN CASE NEW.type WHEN 'annul'  THEN 'Zahtjev za poništenje je povučen.'
                                          WHEN 'delete' THEN 'Zahtjev za brisanje je povučen.' END
  END;

  INSERT INTO public.notifications (
    user_id, type, title, message, data, entity_type, entity_id, severity
  ) VALUES (
    v_recipient,
    'decision_admin_' || v_event,
    v_decision.title,
    v_push_body,
    jsonb_build_object(
      'project_id',   v_decision.project_id,
      'project_name', v_project.name,
      'decision_id',  v_decision.id,
      'decision_title', v_decision.title,
      'request_id',   NEW.id,
      'request_type', NEW.type,
      'event',        v_event
    ),
    'project_decision',
    v_decision.id,
    CASE WHEN v_event IN ('confirmed','requested') THEN 'warning' ELSE 'info' END
  );

  -- Best-effort push (kategorija 'decisions')
  BEGIN
    IF public.is_push_category_enabled(v_recipient, 'decisions') THEN
      PERFORM net.http_post(
        url := v_send_url,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'apikey', v_apikey,
          'Authorization', 'Bearer ' || v_apikey
        ),
        body := jsonb_build_object(
          'user_id', v_recipient,
          'title',   v_decision.title,
          'body',    v_push_body,
          'source',  'decision-admin-request',
          'data',    jsonb_build_object(
             'project_id',  v_decision.project_id,
             'decision_id', v_decision.id,
             'request_id',  NEW.id,
             'request_type', NEW.type,
             'event',       v_event
          )
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'decision-admin push dispatch failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.project_decision_admin_request_notify() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.project_decision_admin_request_notify() TO service_role;

DROP TRIGGER IF EXISTS trg_pdar_notify ON public.project_decision_admin_requests;
CREATE TRIGGER trg_pdar_notify
  AFTER INSERT OR UPDATE OF status ON public.project_decision_admin_requests
  FOR EACH ROW EXECUTE FUNCTION public.project_decision_admin_request_notify();

-- =============================================================
-- 5) RPC: request_decision_admin
-- =============================================================
CREATE OR REPLACE FUNCTION public.request_decision_admin(
  _decision_id uuid,
  _type text,
  _reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_decision  public.project_decisions%ROWTYPE;
  v_request_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF _type NOT IN ('annul','delete') THEN
    RAISE EXCEPTION 'invalid request type: %', _type USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_decision FROM public.project_decisions WHERE id = _decision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'decision_not_found' USING ERRCODE = 'P0002'; END IF;

  IF NOT public.is_project_decision_party(v_decision.project_id, v_uid) THEN
    RAISE EXCEPTION 'not_decision_party' USING ERRCODE = '42501';
  END IF;

  IF v_decision.current_status = 'awaiting_response' THEN
    RAISE EXCEPTION 'active_decision_cannot_be_admined' USING ERRCODE = '22023';
  END IF;

  IF v_decision.annulled_at IS NOT NULL AND _type = 'annul' THEN
    RAISE EXCEPTION 'decision_already_annulled' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.project_decision_admin_requests(
    decision_id, project_id, type, requested_by, reason
  ) VALUES (
    v_decision.id, v_decision.project_id, _type, v_uid, NULLIF(btrim(_reason),'')
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.request_decision_admin(uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.request_decision_admin(uuid, text, text) TO authenticated;

-- =============================================================
-- 6) RPC: withdraw_decision_admin_request (samo predlagatelj)
-- =============================================================
CREATE OR REPLACE FUNCTION public.withdraw_decision_admin_request(
  _request_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.project_decision_admin_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_req FROM public.project_decision_admin_requests WHERE id = _request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request_not_pending' USING ERRCODE = '22023';
  END IF;
  IF v_req.requested_by <> v_uid THEN
    RAISE EXCEPTION 'not_requester' USING ERRCODE = '42501';
  END IF;
  UPDATE public.project_decision_admin_requests
     SET status = 'withdrawn', resolved_by = v_uid, resolved_at = now()
   WHERE id = _request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.withdraw_decision_admin_request(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.withdraw_decision_admin_request(uuid) TO authenticated;

-- =============================================================
-- 7) RPC: resolve_decision_admin_request (samo DRUGA strana)
--    _decision: 'confirm' → izvrši annul/delete; 'decline' → odbij
-- =============================================================
CREATE OR REPLACE FUNCTION public.resolve_decision_admin_request(
  _request_id uuid,
  _decision   text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_req        public.project_decision_admin_requests%ROWTYPE;
  v_decision   public.project_decisions%ROWTYPE;
  v_project    public.projects%ROWTYPE;
  v_amendment  public.project_contract_amendments%ROWTYPE;
  v_new_amendment_id uuid;
  v_cv         numeric;
  v_tb         numeric;
  v_baseline   numeric;
  v_new_contract numeric;
  v_result     jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF _decision NOT IN ('confirm','decline') THEN
    RAISE EXCEPTION 'invalid_decision: %', _decision USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req FROM public.project_decision_admin_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request_not_pending' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_decision FROM public.project_decisions WHERE id = v_req.decision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'decision_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = v_decision.project_id;

  -- Mora biti stranka odluke i NE smije biti predlagatelj
  IF NOT public.is_project_decision_party(v_decision.project_id, v_uid) THEN
    RAISE EXCEPTION 'not_decision_party' USING ERRCODE = '42501';
  END IF;
  IF v_req.requested_by = v_uid THEN
    RAISE EXCEPTION 'requester_cannot_resolve' USING ERRCODE = '42501';
  END IF;

  IF _decision = 'decline' THEN
    UPDATE public.project_decision_admin_requests
       SET status = 'declined', resolved_by = v_uid, resolved_at = now()
     WHERE id = _request_id;
    RETURN jsonb_build_object('ok', true, 'action', 'declined');
  END IF;

  -- CONFIRM path
  IF v_req.type = 'annul' THEN
    IF v_decision.annulled_at IS NOT NULL THEN
      RAISE EXCEPTION 'decision_already_annulled' USING ERRCODE = '22023';
    END IF;

    -- Kompenzacijski aneks ako je odluka bila approved s aneksom
    IF v_decision.contract_amendment_id IS NOT NULL THEN
      SELECT * INTO v_amendment
        FROM public.project_contract_amendments
       WHERE id = v_decision.contract_amendment_id;
      IF FOUND THEN
        PERFORM set_config('app.allow_contract_baseline_write', 'on', true);

        INSERT INTO public.project_contract_amendments(
          project_id, user_id, amendment_amount, note, source_decision_id
        ) VALUES (
          v_decision.project_id,
          v_uid,
          - v_amendment.amendment_amount,
          'Poništenje odluke: ' || v_decision.title,
          v_decision.id
        ) RETURNING id INTO v_new_amendment_id;

        SELECT contract_value, total_budget INTO v_cv, v_tb
          FROM public.projects WHERE id = v_decision.project_id;
        v_baseline := COALESCE(v_cv, 0);
        v_new_contract := GREATEST(v_baseline - v_amendment.amendment_amount, 0);

        UPDATE public.projects SET contract_value = v_new_contract WHERE id = v_decision.project_id;

        PERFORM set_config('app.allow_contract_baseline_write', 'off', true);
      END IF;
    END IF;

    UPDATE public.project_decisions
       SET annulled_at = now(),
           annulled_by = v_uid,
           annul_request_id = v_req.id,
           annul_compensation_amendment_id = v_new_amendment_id,
           updated_at = now()
     WHERE id = v_decision.id;

    UPDATE public.project_decision_admin_requests
       SET status = 'confirmed', resolved_by = v_uid, resolved_at = now()
     WHERE id = _request_id;

    RETURN jsonb_build_object(
      'ok', true, 'action', 'annulled',
      'compensation_amendment_id', v_new_amendment_id
    );
  END IF;

  -- CONFIRM + DELETE
  IF v_req.type = 'delete' THEN
    -- Ukloni izvorni aneks (guarded) — vrati novac u Ugovoreno.
    IF v_decision.contract_amendment_id IS NOT NULL THEN
      SELECT * INTO v_amendment
        FROM public.project_contract_amendments
       WHERE id = v_decision.contract_amendment_id;
      IF FOUND THEN
        PERFORM set_config('app.allow_contract_baseline_write', 'on', true);

        -- Otpusti FK backref (project_decisions.contract_amendment_id) prije DELETE amendmenta.
        UPDATE public.project_decisions
           SET contract_amendment_id = NULL
         WHERE id = v_decision.id;

        DELETE FROM public.project_contract_amendments
         WHERE id = v_amendment.id;

        SELECT contract_value, total_budget INTO v_cv, v_tb
          FROM public.projects WHERE id = v_decision.project_id;
        v_baseline := COALESCE(v_cv, 0);
        v_new_contract := GREATEST(v_baseline - v_amendment.amendment_amount, 0);

        UPDATE public.projects SET contract_value = v_new_contract WHERE id = v_decision.project_id;

        PERFORM set_config('app.allow_contract_baseline_write', 'off', true);
      END IF;
    END IF;

    -- Ukloni sve druge komp. anekse vezane na ovu odluku (poništenja iz prošlosti)
    -- ako uopće postoje — čist arhiv.
    DELETE FROM public.project_contract_amendments
     WHERE source_decision_id = v_decision.id;

    -- Prije DELETE-a koraka: bypass append-only guard.
    PERFORM set_config('app.allow_decision_step_mutation', 'on', true);
    DELETE FROM public.project_decision_steps WHERE decision_id = v_decision.id;
    PERFORM set_config('app.allow_decision_step_mutation', 'off', true);

    -- Attachments (rows) — CASCADE bi ih obrisao, ali eksplicitno radi jasnoće.
    DELETE FROM public.project_decision_attachments WHERE decision_id = v_decision.id;

    -- Sam request rekord: prvo označi confirmed pa obriši odluku (CASCADE bi obrisao request).
    UPDATE public.project_decision_admin_requests
       SET status = 'confirmed', resolved_by = v_uid, resolved_at = now()
     WHERE id = _request_id;

    DELETE FROM public.project_decisions WHERE id = v_decision.id;

    RETURN jsonb_build_object('ok', true, 'action', 'deleted', 'decision_id', v_decision.id, 'project_id', v_project.id);
  END IF;

  RAISE EXCEPTION 'unhandled_request_type: %', v_req.type USING ERRCODE = '22023';
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_decision_admin_request(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.resolve_decision_admin_request(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.request_decision_admin(uuid, text, text) IS
  'Faza 6: predlaže poništenje ili brisanje ZATVORENE odluke. Samo stranke; jedan aktivan zahtjev po odluci.';
COMMENT ON FUNCTION public.resolve_decision_admin_request(uuid, text) IS
  'Faza 6: DRUGA strana potvrđuje/odbija zahtjev; predlagatelj ne smije razriješiti vlastiti zahtjev. Atomarna izvedba annul/delete uključujući novčanu korekciju (aneks ugovora).';
COMMENT ON FUNCTION public.withdraw_decision_admin_request(uuid) IS
  'Faza 6: predlagatelj povlači vlastiti pending zahtjev.';
