-- Krug outbox: emit v2 + retry. Postojeći HTTP emit se preimenuje (tijelo netaknuto),
-- nova krug_emit_notification upisuje outbox pa zove _krug_emit_http, sve u EXCEPTION blokovima.

ALTER FUNCTION public.krug_emit_notification(text, uuid, uuid, uuid, uuid, text, uuid[], jsonb)
  RENAME TO _krug_emit_http;

REVOKE ALL ON FUNCTION public._krug_emit_http(text, uuid, uuid, uuid, uuid, text, uuid[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._krug_emit_http(text, uuid, uuid, uuid, uuid, text, uuid[], jsonb) TO service_role;

CREATE FUNCTION public.krug_emit_notification(
  p_event_type text,
  p_krug_id uuid,
  p_actor_id uuid,
  p_expense_id uuid DEFAULT NULL::uuid,
  p_deletion_request_id uuid DEFAULT NULL::uuid,
  p_dedup_ref text DEFAULT NULL::text,
  p_recipient_override uuid[] DEFAULT NULL::uuid[],
  p_vars jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF p_dedup_ref IS NOT NULL THEN
    BEGIN
      INSERT INTO public.krug_notify_outbox (dedup_ref, event_type, payload, attempts)
      VALUES (
        p_dedup_ref,
        p_event_type,
        jsonb_build_object(
          'krug_id', p_krug_id,
          'actor_id', p_actor_id,
          'expense_id', p_expense_id,
          'deletion_request_id', p_deletion_request_id,
          'recipient_override', to_jsonb(p_recipient_override),
          'vars', p_vars
        ),
        1
      )
      ON CONFLICT (dedup_ref) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
        VALUES ('krug_emit_error', 'error',
          jsonb_build_object('stage', 'outbox_insert', 'code', SQLSTATE, 'message', left(SQLERRM, 300),
                             'dedup_ref', p_dedup_ref, 'event_type', p_event_type),
          'krug_emit_notification@v2');
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END;
  END IF;

  BEGIN
    PERFORM public._krug_emit_http(p_event_type, p_krug_id, p_actor_id, p_expense_id,
      p_deletion_request_id, p_dedup_ref, p_recipient_override, p_vars);
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      UPDATE public.krug_notify_outbox
         SET last_error = left(SQLSTATE || ': ' || SQLERRM, 300)
       WHERE dedup_ref = p_dedup_ref;
      INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
      VALUES ('krug_emit_error', 'error',
        jsonb_build_object('stage', 'http', 'code', SQLSTATE, 'message', left(SQLERRM, 300),
                           'dedup_ref', p_dedup_ref, 'event_type', p_event_type),
        'krug_emit_notification@v2');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.krug_emit_notification(text, uuid, uuid, uuid, uuid, text, uuid[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.krug_emit_notification(text, uuid, uuid, uuid, uuid, text, uuid[], jsonb) TO service_role;

-- Retry: neisporučeni, stariji od 2 min, attempts < 5. Nakon 5. pokušaja jedan krug_emit_failed
-- (last_status = 599 označava da je konačni neuspjeh zabilježen).
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
    SELECT o.dedup_ref, o.event_type, o.attempts
      FROM public.krug_notify_outbox o
     WHERE o.delivered_at IS NULL
       AND o.attempts >= 5
       AND o.last_status IS DISTINCT FROM 599
  LOOP
    BEGIN
      INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
      VALUES ('krug_emit_failed', 'error',
        jsonb_build_object('code', 'max_attempts', 'message', 'delivery failed after 5 attempts',
                           'dedup_ref', r.dedup_ref, 'event_type', r.event_type, 'attempts', r.attempts),
        'krug_notify_outbox_retry@v2');
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
      v_sent := v_sent + 1;
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        UPDATE public.krug_notify_outbox
           SET last_error = left(SQLSTATE || ': ' || SQLERRM, 300)
         WHERE dedup_ref = r.dedup_ref;
        INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
        VALUES ('krug_emit_error', 'error',
          jsonb_build_object('stage', 'retry_http', 'code', SQLSTATE, 'message', left(SQLERRM, 300),
                             'dedup_ref', r.dedup_ref, 'event_type', r.event_type),
          'krug_notify_outbox_retry@v2');
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END;
  END LOOP;

  RETURN v_sent;
END;
$function$;

REVOKE ALL ON FUNCTION public.krug_notify_outbox_retry() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.krug_notify_outbox_retry() TO service_role;
