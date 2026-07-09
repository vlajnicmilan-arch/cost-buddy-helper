-- Correction: krug_emit_notification must present the service_role key as
-- Bearer so notify-krug-event's internal auth guard accepts the call. The
-- previous version used the anon key which left the endpoint effectively
-- open. The service_role key is read from vault (name
-- 'email_queue_service_role_key' — same secret already used by email infra).

CREATE OR REPLACE FUNCTION public.krug_emit_notification(
  p_event_type text,
  p_krug_id uuid,
  p_actor_id uuid,
  p_expense_id uuid DEFAULT NULL,
  p_deletion_request_id uuid DEFAULT NULL,
  p_dedup_ref text DEFAULT NULL,
  p_recipient_override uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _url text := 'https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/notify-krug-event';
  _service_key text;
BEGIN
  SELECT decrypted_secret
    INTO _service_key
    FROM vault.decrypted_secrets
   WHERE name = 'email_queue_service_role_key'
   LIMIT 1;

  IF _service_key IS NULL OR length(_service_key) = 0 THEN
    -- Fail closed: without the internal-auth token the edge function would
    -- reject us anyway. Log and skip so callers are never blocked.
    RAISE WARNING 'krug_emit_notification: service role key missing from vault (email_queue_service_role_key)';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey', _service_key,
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'event_type', p_event_type,
      'krug_id', p_krug_id,
      'actor_id', p_actor_id,
      'expense_id', p_expense_id,
      'deletion_request_id', p_deletion_request_id,
      'dedup_ref', p_dedup_ref,
      'recipient_override', p_recipient_override
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'krug_emit_notification failed: %', SQLERRM;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_emit_notification(text, uuid, uuid, uuid, uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_emit_notification(text, uuid, uuid, uuid, uuid, text, uuid[]) TO service_role;