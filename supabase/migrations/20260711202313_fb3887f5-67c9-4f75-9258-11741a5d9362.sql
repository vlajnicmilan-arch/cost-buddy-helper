-- 1. Upsert dedicated internal shared secret in vault.
--    Value MUST match the KRUG_NOTIFY_INTERNAL_KEY edge function env var.
DO $$
DECLARE
  _existing_id uuid;
BEGIN
  SELECT id INTO _existing_id FROM vault.secrets WHERE name = 'krug_notify_internal_key';
  IF _existing_id IS NULL THEN
    PERFORM vault.create_secret(
      '995c2577eeee0677c18307f58ceb8f4b11dc0caad9c41a34357ece68cf7ce49e5579f8f740f40cf2ff00afb7494146f9',
      'krug_notify_internal_key',
      'Shared secret for DB -> notify-krug-event auth. Mirrors KRUG_NOTIFY_INTERNAL_KEY edge fn env.'
    );
  ELSE
    PERFORM vault.update_secret(
      _existing_id,
      '995c2577eeee0677c18307f58ceb8f4b11dc0caad9c41a34357ece68cf7ce49e5579f8f740f40cf2ff00afb7494146f9',
      'krug_notify_internal_key',
      'Shared secret for DB -> notify-krug-event auth. Mirrors KRUG_NOTIFY_INTERNAL_KEY edge fn env.'
    );
  END IF;
END $$;

-- 2. Point krug_emit_notification at the new secret name.
CREATE OR REPLACE FUNCTION public.krug_emit_notification(
  p_event_type text,
  p_krug_id uuid,
  p_actor_id uuid,
  p_expense_id uuid DEFAULT NULL::uuid,
  p_deletion_request_id uuid DEFAULT NULL::uuid,
  p_dedup_ref text DEFAULT NULL::text,
  p_recipient_override uuid[] DEFAULT NULL::uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _url text := 'https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/notify-krug-event';
  _internal_key text;
BEGIN
  SELECT decrypted_secret
    INTO _internal_key
    FROM vault.decrypted_secrets
   WHERE name = 'krug_notify_internal_key'
   LIMIT 1;

  IF _internal_key IS NULL OR length(_internal_key) = 0 THEN
    RAISE WARNING 'krug_emit_notification: internal key missing from vault (krug_notify_internal_key)';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey', _internal_key,
      'Authorization', 'Bearer ' || _internal_key
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
END;
$function$;