-- Radnici: obavijest o isplati na serveru + pouzdan push kroz poopćeni outbox.
-- (0024 je greškom primijenjena prazna; ovo je stvarni sadržaj.)

ALTER TABLE public.krug_notify_outbox
  ADD COLUMN source text NOT NULL DEFAULT 'krug';
ALTER TABLE public.krug_notify_outbox
  ADD CONSTRAINT krug_notify_outbox_source_chk CHECK (source IN ('krug', 'worker_payout'));

CREATE FUNCTION public._worker_payout_push_http(p_dedup_ref text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6YWx4anJldHZ0dm9raW90dmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMjczNDMsImV4cCI6MjA4NDYwMzM0M30.NKPTQ5hJnMt7M17NUPLNU07CQ3EFZZpOrE2ZQvuEtTw';
BEGIN
  PERFORM net.http_post(
    url := 'https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/notify-worker-payout',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', _key, 'Authorization', 'Bearer ' || _key),
    body := jsonb_build_object('outbox_dedup_ref', p_dedup_ref),
    timeout_milliseconds := 5000
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._worker_payout_push_http(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._worker_payout_push_http(text) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_worker_payout_notifications(p_payout_ids uuid[], p_action text, p_actor uuid, p_batch_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_delivered integer := 0;
  v_rec RECORD;
  v_project_names text[];
  v_project_ids uuid[];
  v_payout_ids uuid[];
  v_total numeric;
  v_amount_fmt text;
  v_title_key text;
  v_message_key text;
  v_title_vars jsonb;
  v_message_vars jsonb;
  v_period_start date;
  v_period_end date;
  v_single_project text;
  v_row_count integer;
  v_attribution_expense uuid;
  v_data jsonb;
  v_project_names_joined text;
  v_dedup text;
BEGIN
  IF p_payout_ids IS NULL OR array_length(p_payout_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  v_dedup := 'worker_payout:'
    || CASE WHEN array_length(p_payout_ids, 1) = 1 OR p_batch_id IS NULL
            THEN p_payout_ids[1]::text ELSE p_batch_id::text END
    || ':' || p_action;

  BEGIN
    FOR v_rec IN
      SELECT w.user_id AS recipient
      FROM public.project_worker_payouts pw
      JOIN public.project_workers w ON w.id = pw.worker_id
      WHERE pw.id = ANY(p_payout_ids)
        AND w.user_id IS NOT NULL
        AND (p_actor IS NULL OR w.user_id <> p_actor)
      GROUP BY w.user_id
    LOOP
      IF EXISTS (SELECT 1 FROM public.notifications n
                  WHERE n.user_id = v_rec.recipient AND n.dedup_key = v_dedup) THEN
        CONTINUE;
      END IF;

      SELECT
        array_agg(DISTINCT p.name),
        array_agg(DISTINCT pw.project_id),
        array_agg(pw.id),
        SUM(pw.paid_amount),
        MIN(pw.period_start),
        MAX(pw.period_end),
        COUNT(*)
      INTO
        v_project_names, v_project_ids, v_payout_ids, v_total, v_period_start, v_period_end, v_row_count
      FROM public.project_worker_payouts pw
      JOIN public.project_workers w ON w.id = pw.worker_id
      JOIN public.projects p ON p.id = pw.project_id
      WHERE pw.id = ANY(p_payout_ids)
        AND w.user_id = v_rec.recipient;

      v_amount_fmt := to_char(COALESCE(v_total,0), 'FM999G999G990D00') || ' EUR';
      v_single_project := CASE WHEN array_length(v_project_names,1) = 1 THEN v_project_names[1] ELSE NULL END;
      v_project_names_joined := array_to_string(v_project_names, ', ');

      IF p_action = 'created' THEN
        IF v_row_count = 1 THEN
          v_title_key := 'notifications.worker_payout.created.single.title';
          v_message_key := 'notifications.worker_payout.created.single.message';
          v_title_vars := jsonb_build_object('project', COALESCE(v_single_project, ''));
          v_message_vars := jsonb_build_object('amount', v_amount_fmt, 'period_start', v_period_start, 'period_end', v_period_end);
        ELSE
          v_title_key := 'notifications.worker_payout.created.batch.title';
          v_message_key := 'notifications.worker_payout.created.batch.message';
          v_title_vars := jsonb_build_object('count', array_length(v_project_names,1));
          v_message_vars := jsonb_build_object('amount', v_amount_fmt, 'count', array_length(v_project_names,1), 'project_names', v_project_names_joined);
        END IF;
      ELSE
        IF v_row_count = 1 THEN
          v_title_key := 'notifications.worker_payout.voided.single.title';
          v_message_key := 'notifications.worker_payout.voided.single.message';
          v_title_vars := jsonb_build_object('project', COALESCE(v_single_project, ''));
          v_message_vars := jsonb_build_object('amount', v_amount_fmt, 'period_start', v_period_start, 'period_end', v_period_end);
        ELSE
          v_title_key := 'notifications.worker_payout.voided.batch.title';
          v_message_key := 'notifications.worker_payout.voided.batch.message';
          v_title_vars := jsonb_build_object('count', array_length(v_project_names,1));
          v_message_vars := jsonb_build_object('amount', v_amount_fmt, 'count', array_length(v_project_names,1));
        END IF;
      END IF;

      v_data := jsonb_build_object(
        'batch_id', p_batch_id,
        'payout_ids', to_jsonb(v_payout_ids),
        'project_ids', to_jsonb(v_project_ids),
        'project_names', to_jsonb(v_project_names),
        'paid_amount_total', v_total,
        'action', p_action,
        'source', 'server',
        'title_vars', v_title_vars,
        'message_vars', v_message_vars
      );

      IF p_action = 'voided' THEN
        v_attribution_expense := NULL;
        IF p_batch_id IS NOT NULL THEN
          SELECT id INTO v_attribution_expense FROM public.expenses
           WHERE user_id = v_rec.recipient AND worker_payout_batch_id = p_batch_id AND deleted_at IS NULL
           ORDER BY created_at DESC LIMIT 1;
        END IF;
        IF v_attribution_expense IS NULL THEN
          SELECT id INTO v_attribution_expense FROM public.expenses
           WHERE user_id = v_rec.recipient AND worker_payout_id = ANY(v_payout_ids) AND deleted_at IS NULL
           ORDER BY created_at DESC LIMIT 1;
        END IF;
        IF v_attribution_expense IS NOT NULL THEN
          v_data := v_data || jsonb_build_object('worker_attribution_expense_id', v_attribution_expense);
        END IF;
      END IF;

      INSERT INTO public.notifications (user_id, type, title, message, data, dedup_key)
      VALUES (
        v_rec.recipient,
        CASE WHEN p_action = 'created' THEN 'worker_payout_created' ELSE 'worker_payout_voided' END,
        v_title_key, v_message_key, v_data, v_dedup
      );
      v_delivered := v_delivered + 1;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
      VALUES ('worker_payout_notify_error', 'error',
        jsonb_build_object('stage', 'in_app', 'code', SQLSTATE, 'message', left(SQLERRM, 300),
                           'payout_id', p_payout_ids[1], 'batch_id', p_batch_id, 'dedup_ref', v_dedup),
        'enqueue_worker_payout_notifications@v2');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN 0;
  END;

  IF v_delivered > 0 THEN
    BEGIN
      INSERT INTO public.krug_notify_outbox (dedup_ref, event_type, payload, attempts, source)
      VALUES (v_dedup, 'worker_payout_' || p_action,
        jsonb_build_object('payout_ids', to_jsonb(p_payout_ids), 'batch_id', p_batch_id,
                           'action', p_action, 'actor_id', p_actor),
        1, 'worker_payout')
      ON CONFLICT (dedup_ref) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
        VALUES ('worker_payout_notify_error', 'error',
          jsonb_build_object('stage', 'outbox_insert', 'code', SQLSTATE, 'message', left(SQLERRM, 300),
                             'payout_id', p_payout_ids[1], 'batch_id', p_batch_id, 'dedup_ref', v_dedup),
          'enqueue_worker_payout_notifications@v2');
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
                             'payout_id', p_payout_ids[1], 'batch_id', p_batch_id, 'dedup_ref', v_dedup),
          'enqueue_worker_payout_notifications@v2');
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END;
  END IF;

  RETURN v_delivered;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_worker_payout_notifications(uuid[], text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_worker_payout_notifications(uuid[], text, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_worker_payout_notify_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_suppress text := current_setting('vmbalance.suppress_worker_payout_notify', true);
BEGIN
  IF v_suppress IS NOT NULL AND v_suppress = '1' THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM public.enqueue_worker_payout_notifications(ARRAY[NEW.id]::uuid[], 'created', auth.uid(), NEW.batch_id);
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
      VALUES ('worker_payout_notify_error', 'error',
        jsonb_build_object('stage', 'trigger_insert', 'code', SQLSTATE, 'message', left(SQLERRM, 300), 'payout_id', NEW.id),
        'trg_worker_payout_notify_insert@v2');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_worker_payout_notify_void()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_suppress text := current_setting('vmbalance.suppress_worker_payout_notify', true);
BEGIN
  IF v_suppress IS NOT NULL AND v_suppress = '1' THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'voided' AND (OLD.status IS DISTINCT FROM 'voided') THEN
    BEGIN
      PERFORM public.enqueue_worker_payout_notifications(ARRAY[NEW.id]::uuid[], 'voided', auth.uid(), NEW.batch_id);
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
        VALUES ('worker_payout_notify_error', 'error',
          jsonb_build_object('stage', 'trigger_void', 'code', SQLSTATE, 'message', left(SQLERRM, 300), 'payout_id', NEW.id),
          'trg_worker_payout_notify_void@v2');
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_worker_payout_notify_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_worker_payout_notify_void() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.krug_notify_outbox_retry()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  r record;
  v_sent integer := 0;
BEGIN
  FOR r IN
    SELECT o.dedup_ref, o.event_type, o.attempts, o.source
      FROM public.krug_notify_outbox o
     WHERE o.delivered_at IS NULL
       AND o.attempts >= 5
       AND o.last_status IS DISTINCT FROM 599
  LOOP
    BEGIN
      INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
      VALUES (CASE WHEN r.source = 'worker_payout' THEN 'worker_payout_notify_failed' ELSE 'krug_emit_failed' END,
        'error',
        jsonb_build_object('code', 'max_attempts', 'message', 'delivery failed after 5 attempts',
                           'dedup_ref', r.dedup_ref, 'event_type', r.event_type, 'attempts', r.attempts,
                           'source', r.source),
        'krug_notify_outbox_retry@v3');
      UPDATE public.krug_notify_outbox SET last_status = 599 WHERE dedup_ref = r.dedup_ref;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  FOR r IN
    SELECT o.*
      FROM public.krug_notify_outbox o
     WHERE o.delivered_at IS NULL
       AND o.attempts < 5
       AND o.created_at < now() - interval '2 minutes'
     ORDER BY o.created_at
     LIMIT 50
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.krug_notify_outbox SET attempts = attempts + 1 WHERE dedup_ref = r.dedup_ref;
    BEGIN
      IF r.source = 'worker_payout' THEN
        PERFORM public._worker_payout_push_http(r.dedup_ref);
      ELSE
        PERFORM public._krug_emit_http(
          r.event_type,
          (r.payload->>'krug_id')::uuid,
          (r.payload->>'actor_id')::uuid,
          (r.payload->>'expense_id')::uuid,
          (r.payload->>'deletion_request_id')::uuid,
          r.dedup_ref,
          CASE WHEN jsonb_typeof(r.payload->'recipient_override') = 'array'
               THEN ARRAY(SELECT jsonb_array_elements_text(r.payload->'recipient_override')::uuid)
               ELSE NULL END,
          CASE WHEN jsonb_typeof(r.payload->'vars') = 'object' THEN r.payload->'vars' ELSE NULL END);
      END IF;
      v_sent := v_sent + 1;
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        UPDATE public.krug_notify_outbox
           SET last_error = left(SQLSTATE || ': ' || SQLERRM, 300)
         WHERE dedup_ref = r.dedup_ref;
        INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
        VALUES (CASE WHEN r.source = 'worker_payout' THEN 'worker_payout_notify_error' ELSE 'krug_emit_error' END,
          'error',
          jsonb_build_object('stage', 'retry_http', 'code', SQLSTATE, 'message', left(SQLERRM, 300),
                             'dedup_ref', r.dedup_ref, 'event_type', r.event_type, 'source', r.source),
          'krug_notify_outbox_retry@v3');
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END;
  END LOOP;

  RETURN v_sent;
END;
$function$;

REVOKE ALL ON FUNCTION public.krug_notify_outbox_retry() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.krug_notify_outbox_retry() TO service_role;