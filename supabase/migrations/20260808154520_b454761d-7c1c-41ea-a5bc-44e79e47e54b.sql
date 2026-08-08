-- 1) Additive: allow interpolation vars to reach notify-krug-event.
CREATE OR REPLACE FUNCTION public.krug_emit_notification(
  p_event_type text,
  p_krug_id uuid,
  p_actor_id uuid,
  p_expense_id uuid DEFAULT NULL::uuid,
  p_deletion_request_id uuid DEFAULT NULL::uuid,
  p_dedup_ref text DEFAULT NULL::text,
  p_recipient_override uuid[] DEFAULT NULL::uuid[],
  p_vars jsonb DEFAULT NULL::jsonb
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
      'recipient_override', p_recipient_override,
      'vars', p_vars
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.krug_emit_notification(text, uuid, uuid, uuid, uuid, text, uuid[], jsonb) FROM anon;

-- 2) One-off retroactive notice: members added by someone else, pre-consent.
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT m.id AS membership_id, m.krug_id, m.user_id, m.created_at, k.name AS krug_name, o.user_id AS owner_id
      FROM public.krug_membership m
      JOIN public.krug k ON k.id = m.krug_id
      JOIN public.krug_ownership o ON o.krug_id = m.krug_id
     WHERE k.lifecycle_state = 'active'
       AND k.deleted_at IS NULL
       AND m.user_id <> o.user_id
       AND m.added_by IS NOT NULL
       AND m.added_by <> m.user_id
       AND m.created_at < '2026-08-08'::timestamptz
       AND NOT EXISTS (
         SELECT 1 FROM public.krug_invitations i
          WHERE i.krug_id = m.krug_id AND i.invited_user_id = m.user_id
       )
  LOOP
    PERFORM public.krug_emit_notification(
      'krug_membership_notice',
      r.krug_id,
      r.owner_id,
      NULL,
      NULL,
      'membership_notice:' || r.membership_id::text,
      ARRAY[r.user_id],
      jsonb_build_object('krug', r.krug_name, 'date', to_char(r.created_at, 'DD.MM.YYYY.'))
    );
  END LOOP;
END
$do$;