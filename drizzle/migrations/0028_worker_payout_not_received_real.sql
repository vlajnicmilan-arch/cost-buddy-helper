-- Radnici: „Nisam primio" + isplate na čekanju (nalog 3/3). 0027 je primijenjena prazna; ovo je stvarni sadržaj.
-- Povezani radnik prijavljuje da isplata nije stigla; vlasnik dobiva obavijest kroz outbox.
-- Isplata se ne mijenja, nema automatskog storna.

CREATE TABLE public.worker_payout_receipt_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid,
  batch_id uuid,
  payout_ids uuid[] NOT NULL,
  worker_user_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  note text,
  client_request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wprr_one_target CHECK ((payout_id IS NULL) <> (batch_id IS NULL)),
  CONSTRAINT wprr_note_len CHECK (note IS NULL OR char_length(note) <= 500)
);
CREATE UNIQUE INDEX uniq_wprr_payout ON public.worker_payout_receipt_reports (payout_id) WHERE payout_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_wprr_batch ON public.worker_payout_receipt_reports (batch_id) WHERE batch_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_wprr_client_request ON public.worker_payout_receipt_reports (worker_user_id, client_request_id);
CREATE INDEX idx_wprr_payout_ids ON public.worker_payout_receipt_reports USING gin (payout_ids);
CREATE INDEX idx_wprr_owner ON public.worker_payout_receipt_reports (owner_user_id);

REVOKE ALL ON public.worker_payout_receipt_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.worker_payout_receipt_reports TO authenticated;
GRANT ALL ON public.worker_payout_receipt_reports TO service_role;
ALTER TABLE public.worker_payout_receipt_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Worker reads own reports" ON public.worker_payout_receipt_reports
  FOR SELECT TO authenticated USING (worker_user_id = auth.uid());
CREATE POLICY "Owner reads reports for own projects" ON public.worker_payout_receipt_reports
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());

CREATE FUNCTION public.worker_report_payout_not_received(
  p_client_request_id uuid,
  p_payout_id uuid DEFAULT NULL,
  p_batch_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_count int;
  v_foreign int;
  v_voided int;
  v_total numeric;
  v_owner uuid;
  v_owner_count int;
  v_project uuid;
  v_currency text;
  v_expense uuid;
  v_note text := NULLIF(btrim(p_note), '');
  v_existing public.worker_payout_receipt_reports%ROWTYPE;
  v_report_id uuid;
  v_worker_name text;
  v_amount_fmt text;
  v_dedup text;
  v_notified boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id_required' USING ERRCODE = '22023';
  END IF;
  IF (p_payout_id IS NULL) = (p_batch_id IS NULL) THEN
    RAISE EXCEPTION 'exactly_one_target' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'note_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(pw.id ORDER BY pw.id)
    INTO v_ids
    FROM (SELECT id FROM public.project_worker_payouts
           WHERE (p_payout_id IS NOT NULL AND id = p_payout_id)
              OR (p_batch_id IS NOT NULL AND batch_id = p_batch_id)
           ORDER BY id
           FOR UPDATE) pw;
  v_count := COALESCE(array_length(v_ids, 1), 0);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) FILTER (WHERE w.user_id IS DISTINCT FROM v_uid),
         count(*) FILTER (WHERE pw.status = 'voided' OR pw.voided_at IS NOT NULL OR pw.deleted_at IS NOT NULL),
         SUM(pw.paid_amount),
         MIN(p.user_id::text)::uuid,
         count(DISTINCT p.user_id),
         MIN(pw.project_id::text)::uuid,
         MIN(upper(COALESCE(NULLIF(trim(cps.currency), ''), 'EUR'))),
         (array_agg(pw.expense_id ORDER BY pw.id) FILTER (WHERE pw.expense_id IS NOT NULL))[1]
    INTO v_foreign, v_voided, v_total, v_owner, v_owner_count, v_project, v_currency, v_expense
    FROM public.project_worker_payouts pw
    JOIN public.project_workers w ON w.id = pw.worker_id
    JOIN public.projects p ON p.id = pw.project_id
    LEFT JOIN public.custom_payment_sources cps
      ON pw.payment_source LIKE 'custom:%'
     AND cps.id::text = substr(pw.payment_source, 8)
   WHERE pw.id = ANY(v_ids);

  IF v_foreign > 0 THEN
    RAISE EXCEPTION 'not_payout_recipient' USING ERRCODE = '42501';
  END IF;

  -- Idempotent repeat: same request id, or the same target already reported.
  SELECT * INTO v_existing FROM public.worker_payout_receipt_reports
   WHERE worker_user_id = v_uid AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.payout_id IS NOT DISTINCT FROM p_payout_id
       AND v_existing.batch_id IS NOT DISTINCT FROM p_batch_id THEN
      RETURN jsonb_build_object('ok', true, 'report_id', v_existing.id, 'idempotent', true);
    END IF;
    RAISE EXCEPTION 'client_request_id_reused' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_existing FROM public.worker_payout_receipt_reports
   WHERE (p_payout_id IS NOT NULL AND payout_id = p_payout_id)
      OR (p_batch_id IS NOT NULL AND batch_id = p_batch_id);
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'report_id', v_existing.id, 'idempotent', true);
  END IF;
  IF EXISTS (SELECT 1 FROM public.worker_payout_receipt_reports WHERE payout_ids && v_ids) THEN
    RAISE EXCEPTION 'already_reported' USING ERRCODE = '22023';
  END IF;

  IF v_voided > 0 THEN
    RAISE EXCEPTION 'payout_voided' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.expenses e
     WHERE e.user_id = v_uid
       AND (e.worker_payout_id = ANY(v_ids)
            OR e.worker_payout_batch_id IN (
                 SELECT pw.batch_id FROM public.project_worker_payouts pw
                  WHERE pw.id = ANY(v_ids) AND pw.batch_id IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'already_confirmed' USING ERRCODE = '22023';
  END IF;
  IF v_owner_count <> 1 THEN
    RAISE EXCEPTION 'mixed_owner' USING ERRCODE = '22023';
  END IF;

  v_total := ROUND(COALESCE(v_total, 0), 2);
  INSERT INTO public.worker_payout_receipt_reports (
    payout_id, batch_id, payout_ids, worker_user_id, owner_user_id, project_id,
    amount, currency, note, client_request_id
  ) VALUES (
    p_payout_id, p_batch_id, v_ids, v_uid, v_owner, v_project,
    v_total, COALESCE(v_currency, 'EUR'), v_note, p_client_request_id
  ) RETURNING id INTO v_report_id;

  v_dedup := 'worker_payout_nr:' || COALESCE(p_payout_id, p_batch_id)::text;

  -- Owner notification; failures leave a trace and never undo the report.
  BEGIN
    SELECT NULLIF(btrim(concat_ws(' ', w.first_name, w.last_name)), '')
      INTO v_worker_name
      FROM public.project_workers w
      JOIN public.project_worker_payouts pw ON pw.worker_id = w.id
     WHERE pw.id = v_ids[1];
    IF v_worker_name IS NULL THEN
      SELECT NULLIF(btrim(display_name), '') INTO v_worker_name FROM public.profiles WHERE user_id = v_uid;
    END IF;
    v_amount_fmt := to_char(v_total, 'FM999G999G990D00') || ' ' || COALESCE(v_currency, 'EUR');

    IF NOT EXISTS (SELECT 1 FROM public.notifications
                    WHERE user_id = v_owner AND dedup_key = v_dedup) THEN
      INSERT INTO public.notifications (user_id, type, title, message, data, dedup_key)
      VALUES (v_owner, 'worker_payout_not_received',
        'notifications.worker_payout.not_received.title',
        'notifications.worker_payout.not_received.message',
        jsonb_build_object(
          'report_id', v_report_id,
          'payout_ids', to_jsonb(v_ids),
          'batch_id', p_batch_id,
          'project_id', v_project,
          'route', '/projects?id=' || v_project::text,
          'highlight', CASE WHEN v_expense IS NULL THEN NULL
                            ELSE jsonb_build_object('type', 'expense', 'id', v_expense) END,
          'title_vars', jsonb_build_object('worker', COALESCE(v_worker_name, '')),
          'message_vars', jsonb_build_object('worker', COALESCE(v_worker_name, ''), 'amount', v_amount_fmt),
          'source', 'server'),
        v_dedup);
      v_notified := true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
      VALUES ('worker_payout_notify_error', 'error',
        jsonb_build_object('stage', 'in_app_not_received', 'code', SQLSTATE, 'message', left(SQLERRM, 300),
                           'report_id', v_report_id, 'dedup_ref', v_dedup),
        'worker_report_payout_not_received@v1');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;

  IF v_notified THEN
    BEGIN
      INSERT INTO public.krug_notify_outbox (dedup_ref, event_type, payload, attempts, source)
      VALUES (v_dedup, 'worker_payout_not_received',
        jsonb_build_object('report_id', v_report_id), 1, 'worker_payout')
      ON CONFLICT (dedup_ref) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
        VALUES ('worker_payout_notify_error', 'error',
          jsonb_build_object('stage', 'outbox_insert', 'code', SQLSTATE, 'message', left(SQLERRM, 300),
                             'report_id', v_report_id, 'dedup_ref', v_dedup),
          'worker_report_payout_not_received@v1');
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END;

    BEGIN
      PERFORM public._worker_payout_push_http(v_dedup);
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        UPDATE public.krug_notify_outbox SET last_error = left(SQLSTATE || ': ' || SQLERRM, 300)
         WHERE dedup_ref = v_dedup;
        INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
        VALUES ('worker_payout_notify_error', 'error',
          jsonb_build_object('stage', 'push', 'code', SQLSTATE, 'message', left(SQLERRM, 300),
                             'report_id', v_report_id, 'dedup_ref', v_dedup),
          'worker_report_payout_not_received@v1');
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'report_id', v_report_id, 'idempotent', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.worker_report_payout_not_received(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_report_payout_not_received(uuid, uuid, uuid, text) TO authenticated, service_role;

-- Pending payouts for the signed-in linked worker. Only payouts created after this
-- migration appear (cutoff is baked in as a literal at apply time).
DO $do$
BEGIN
  EXECUTE format($f$
CREATE FUNCTION public.get_my_pending_payouts()
RETURNS TABLE (
  payout_id uuid, batch_id uuid, project_id uuid, project_name text,
  paid_amount numeric, currency text, paid_at timestamptz, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $body$
  SELECT pw.id, pw.batch_id, pw.project_id, p.name, pw.paid_amount,
         upper(COALESCE(NULLIF(trim(cps.currency), ''), 'EUR')), pw.paid_at, pw.created_at
    FROM public.project_worker_payouts pw
    JOIN public.project_workers w ON w.id = pw.worker_id
    JOIN public.projects p ON p.id = pw.project_id
    LEFT JOIN public.custom_payment_sources cps
      ON pw.payment_source LIKE 'custom:%%'
     AND cps.id::text = substr(pw.payment_source, 8)
   WHERE auth.uid() IS NOT NULL
     AND w.user_id = auth.uid()
     AND pw.created_at > %L::timestamptz
     AND pw.status IS DISTINCT FROM 'voided'
     AND pw.voided_at IS NULL
     AND pw.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.expenses e
        WHERE e.user_id = auth.uid()
          AND (e.worker_payout_id = pw.id
               OR (pw.batch_id IS NOT NULL AND e.worker_payout_batch_id = pw.batch_id)))
     AND NOT EXISTS (
       SELECT 1 FROM public.worker_payout_receipt_reports r
        WHERE r.worker_user_id = auth.uid() AND pw.id = ANY(r.payout_ids))
   ORDER BY pw.created_at DESC
$body$;
$f$, now());
END
$do$;

REVOKE ALL ON FUNCTION public.get_my_pending_payouts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pending_payouts() TO authenticated, service_role;
