-- Živa definicija krug_emit_notification prije migracije emit v2 (pg_get_functiondef, 25.9.2026).
-- Harness je stvara da migracija emit v2 ima što preimenovati.
DROP FUNCTION IF EXISTS public.krug_emit_notification(text, uuid, uuid, uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.krug_emit_notification(text, uuid, uuid, uuid, uuid, text, uuid[], jsonb);
CREATE FUNCTION public.krug_emit_notification(p_event_type text, p_krug_id uuid, p_actor_id uuid, p_expense_id uuid DEFAULT NULL::uuid, p_deletion_request_id uuid DEFAULT NULL::uuid, p_dedup_ref text DEFAULT NULL::text, p_recipient_override uuid[] DEFAULT NULL::uuid[], p_vars jsonb DEFAULT NULL::jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _url text := 'https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/notify-krug-event';
  _internal_key text;
BEGIN
  SELECT decrypted_secret INTO _internal_key FROM vault.decrypted_secrets
   WHERE name = 'krug_notify_internal_key' LIMIT 1;
  IF _internal_key IS NULL OR length(_internal_key) = 0 THEN
    RAISE WARNING 'krug_emit_notification: internal key missing from vault (krug_notify_internal_key)';
    RETURN;
  END IF;
  PERFORM net.http_post(url := _url,
    headers := jsonb_build_object('Content-Type','application/json','apikey', _internal_key,'Authorization', 'Bearer ' || _internal_key),
    body := jsonb_build_object('event_type', p_event_type,'krug_id', p_krug_id,'actor_id', p_actor_id,'expense_id', p_expense_id,
      'deletion_request_id', p_deletion_request_id,'dedup_ref', p_dedup_ref,'recipient_override', p_recipient_override,'vars', p_vars));
END;
$function$;
REVOKE ALL ON FUNCTION public.krug_emit_notification(text, uuid, uuid, uuid, uuid, text, uuid[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.krug_emit_notification(text, uuid, uuid, uuid, uuid, text, uuid[], jsonb) TO service_role;
