CREATE OR REPLACE FUNCTION public.mail_confirm_log_reject(
  p_uid uuid,
  p_item_id uuid,
  p_reason text,
  p_missing text[],
  p_allow_missing_oib boolean,
  p_allow_missing_number boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.app_diagnostics_logs (session_id, user_id, event, severity, details)
  VALUES (
    'mail-import', p_uid, 'mail_item_confirm_rejected', 'warning',
    jsonb_build_object(
      'item_id', p_item_id,
      'reason', p_reason,
      'missing', COALESCE(to_jsonb(p_missing), '[]'::jsonb),
      'allow_missing_oib', p_allow_missing_oib,
      'allow_missing_number', p_allow_missing_number
    )
  );
EXCEPTION WHEN OTHERS THEN
  NULL; -- telemetrija nikad ne ruši potvrdu
END;
$function$;

REVOKE ALL ON FUNCTION public.mail_confirm_log_reject(uuid, uuid, text, text[], boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_confirm_log_reject(uuid, uuid, text, text[], boolean, boolean) TO service_role;