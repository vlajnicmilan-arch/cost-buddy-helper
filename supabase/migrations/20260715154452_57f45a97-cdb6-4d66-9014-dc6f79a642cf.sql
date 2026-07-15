
-- ============================================================
-- Faza 6 REV — ukini "delete" zahtjeve, uvedi "withdraw" prijedloga
-- ============================================================

-- 1) Obradi eventualne pending 'delete' zahtjeve (u produkciji: 0)
UPDATE public.project_decision_admin_requests
   SET status      = 'declined',
       resolved_at = now(),
       reason      = COALESCE(NULLIF(reason,''), '') ||
                     CASE WHEN reason IS NOT NULL AND reason <> '' THEN ' ' ELSE '' END ||
                     '[feature_removed]'
 WHERE type = 'delete' AND status = 'pending';

-- 2) Ograniči enum na 'annul' (drop stari CHECK, dodaj novi)
ALTER TABLE public.project_decision_admin_requests
  DROP CONSTRAINT IF EXISTS project_decision_admin_requests_type_check;
ALTER TABLE public.project_decision_admin_requests
  ADD CONSTRAINT project_decision_admin_requests_type_check
  CHECK (type = 'annul');

-- 3) request_decision_admin — odbaci sve što nije 'annul'
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
  v_uid        uuid := auth.uid();
  v_decision   public.project_decisions%ROWTYPE;
  v_request_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF _type <> 'annul' THEN
    RAISE EXCEPTION 'invalid_request_type: %', _type USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_decision FROM public.project_decisions WHERE id = _decision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'decision_not_found' USING ERRCODE = 'P0002'; END IF;

  IF NOT public.is_project_decision_party(v_decision.project_id, v_uid) THEN
    RAISE EXCEPTION 'not_decision_party' USING ERRCODE = '42501';
  END IF;

  IF v_decision.current_status = 'awaiting_response' THEN
    RAISE EXCEPTION 'active_decision_cannot_be_admined' USING ERRCODE = '22023';
  END IF;

  IF v_decision.annulled_at IS NOT NULL THEN
    RAISE EXCEPTION 'decision_already_annulled' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.project_decision_admin_requests(
    decision_id, project_id, type, requested_by, reason
  ) VALUES (
    v_decision.id, v_decision.project_id, 'annul', v_uid, NULLIF(btrim(_reason),'')
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- 4) resolve_decision_admin_request — ukloni 'delete' granu
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
  v_baseline   numeric;
  v_new_contract numeric;
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
  IF v_req.type <> 'annul' THEN
    RAISE EXCEPTION 'unsupported_request_type: %', v_req.type USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_decision FROM public.project_decisions WHERE id = v_req.decision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'decision_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = v_decision.project_id;

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

  -- CONFIRM (annul only)
  IF v_decision.annulled_at IS NOT NULL THEN
    RAISE EXCEPTION 'decision_already_annulled' USING ERRCODE = '22023';
  END IF;

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

      SELECT contract_value INTO v_cv
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
END;
$$;

-- 5) Notify trigger — očisti 'delete' tekst grane
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
    v_recipient := v_other_party;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status <> 'pending' THEN
    v_event := NEW.status;
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
    WHEN 'requested'  THEN 'Zahtjev za poništenje odluke čeka tvoju potvrdu.'
    WHEN 'confirmed'  THEN 'Poništenje odluke je potvrđeno.'
    WHEN 'declined'   THEN 'Poništenje odluke je odbijeno.'
    WHEN 'withdrawn'  THEN 'Zahtjev za poništenje je povučen.'
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

-- 6) Audit log za povlačenje prijedloga
CREATE TABLE IF NOT EXISTS public.decision_withdrawal_log (
  id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  decision_id   uuid NOT NULL,
  project_id    uuid NOT NULL,
  created_by    uuid NOT NULL,
  withdrawn_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.decision_withdrawal_log TO authenticated;
GRANT ALL    ON public.decision_withdrawal_log TO service_role;

ALTER TABLE public.decision_withdrawal_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parties can view withdrawal log" ON public.decision_withdrawal_log;
CREATE POLICY "Parties can view withdrawal log"
  ON public.decision_withdrawal_log
  FOR SELECT TO authenticated
  USING (public.is_project_decision_party(project_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_decision_withdrawal_log_project
  ON public.decision_withdrawal_log(project_id, withdrawn_at DESC);

-- 7) RPC: withdraw_decision_proposal
--    Uvjeti (svi moraju vrijediti):
--      * autentificirani korisnik
--      * odluka postoji, current_status='awaiting_response'
--      * created_by = auth.uid()
--      * točno 1 korak (samo initial 'propose'; nula odgovora)
--    Izvršenje: audit log → obavijest drugoj strani → hard-delete
--    (attachments → steps s bypass → decision).
CREATE OR REPLACE FUNCTION public.withdraw_decision_proposal(
  _decision_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_decision     public.project_decisions%ROWTYPE;
  v_project      public.projects%ROWTYPE;
  v_investor_id  uuid;
  v_other_party  uuid;
  v_step_count   int;
  v_send_url     text := 'https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/send-push';
  v_apikey       text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6YWx4anJldHZ0dm9raW90dmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMjczNDMsImV4cCI6MjA4NDYwMzM0M30.NKPTQ5hJnMt7M17NUPLNU07CQ3EFZZpOrE2ZQvuEtTw';
  v_body         text := 'Prijedlog odluke je povučen.';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;

  -- Lock the row to serialize with concurrent step inserts
  SELECT * INTO v_decision FROM public.project_decisions WHERE id = _decision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'decision_not_found' USING ERRCODE = 'P0002'; END IF;

  IF v_decision.created_by <> v_uid THEN
    RAISE EXCEPTION 'not_proposer' USING ERRCODE = '42501';
  END IF;
  IF v_decision.current_status <> 'awaiting_response' THEN
    RAISE EXCEPTION 'already_responded' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_step_count
    FROM public.project_decision_steps WHERE decision_id = v_decision.id;
  IF v_step_count <> 1 THEN
    RAISE EXCEPTION 'already_responded' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = v_decision.project_id;
  SELECT user_id INTO v_investor_id
    FROM public.project_members
    WHERE project_id = v_decision.project_id AND role = 'investor'
    LIMIT 1;
  v_other_party := CASE WHEN v_uid = v_project.user_id THEN v_investor_id ELSE v_project.user_id END;

  -- Audit log (bez sadržaja)
  INSERT INTO public.decision_withdrawal_log(decision_id, project_id, created_by)
  VALUES (v_decision.id, v_decision.project_id, v_uid);

  -- In-app notifikacija drugoj strani (ako postoji)
  IF v_other_party IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id, type, title, message, data, entity_type, entity_id, severity
    ) VALUES (
      v_other_party,
      'decision_proposal_withdrawn',
      v_decision.title,
      v_body,
      jsonb_build_object(
        'project_id',     v_decision.project_id,
        'project_name',   v_project.name,
        'decision_id',    v_decision.id,
        'decision_title', v_decision.title,
        'event',          'withdrawn_proposal'
      ),
      'project_decision',
      v_decision.id,
      'info'
    );

    BEGIN
      IF public.is_push_category_enabled(v_other_party, 'decisions') THEN
        PERFORM net.http_post(
          url := v_send_url,
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'apikey', v_apikey,
            'Authorization', 'Bearer ' || v_apikey
          ),
          body := jsonb_build_object(
            'user_id', v_other_party,
            'title',   v_decision.title,
            'body',    v_body,
            'source',  'decision-proposal-withdrawn',
            'data',    jsonb_build_object(
              'project_id',  v_decision.project_id,
              'decision_id', v_decision.id,
              'event',       'withdrawn_proposal'
            )
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'decision-withdraw push dispatch failed: %', SQLERRM;
    END;
  END IF;

  -- Hard delete: attachments (rows), steps (bypass append-only), decision
  DELETE FROM public.project_decision_attachments WHERE decision_id = v_decision.id;

  PERFORM set_config('app.allow_decision_step_mutation', 'on', true);
  DELETE FROM public.project_decision_steps WHERE decision_id = v_decision.id;
  PERFORM set_config('app.allow_decision_step_mutation', 'off', true);

  DELETE FROM public.project_decisions WHERE id = v_decision.id;

  RETURN jsonb_build_object(
    'ok', true,
    'action', 'withdrawn_proposal',
    'decision_id', v_decision.id,
    'project_id',  v_decision.project_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_decision_proposal(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.withdraw_decision_proposal(uuid) TO authenticated;

COMMENT ON FUNCTION public.withdraw_decision_proposal(uuid) IS
  'Faza 6 REV: autor povlači vlastiti prijedlog dok druga strana još nije odgovorila (steps_count=1). Hard-delete odluke + priloga; audit u decision_withdrawal_log; push/in-app drugoj strani.';
COMMENT ON FUNCTION public.request_decision_admin(uuid, text, text) IS
  'Faza 6 REV: predlaže SAMO poništenje zatvorene odluke (type=annul). Brisanje je uklonjeno.';
COMMENT ON FUNCTION public.resolve_decision_admin_request(uuid, text) IS
  'Faza 6 REV: DRUGA strana potvrđuje/odbija annul zahtjev; predlagatelj ne smije razriješiti vlastiti zahtjev.';
