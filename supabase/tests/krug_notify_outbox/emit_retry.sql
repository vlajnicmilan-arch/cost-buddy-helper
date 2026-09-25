-- Krug pouzdana isporuka obavijesti — emit (v2) i retry posao.
-- Ovaj SQL se NE primjenjuje kroz alat za migracije (alat odbija SQL koji čita
-- vault ključ); primjenjuje se ručno u SQL editoru Cloud sučelja.
-- Testni okvir ga primjenjuje na bacivu bazu (run.sh).
-- Pretpostavka: 0020_krug_notify_outbox_table i 0021_krug_notify_outbox_mark_delivered
-- su već primijenjeni.

CREATE OR REPLACE FUNCTION public.krug_emit_notification(p_event_type text, p_krug_id uuid, p_actor_id uuid, p_expense_id uuid DEFAULT NULL::uuid, p_deletion_request_id uuid DEFAULT NULL::uuid, p_dedup_ref text DEFAULT NULL::text, p_recipient_override uuid[] DEFAULT NULL::uuid[], p_vars jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _url text := 'https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/notify-krug-event';
  _internal_key text;
  _version text := 'krug_emit_notification v2';
  _dedup_ref text;
  _payload jsonb;
BEGIN
  _dedup_ref := COALESCE(NULLIF(p_dedup_ref, ''), 'krug:auto:' || gen_random_uuid()::text);
  _payload := jsonb_build_object(
    'event_type', p_event_type,
    'krug_id', p_krug_id,
    'actor_id', p_actor_id,
    'expense_id', p_expense_id,
    'deletion_request_id', p_deletion_request_id,
    'dedup_ref', _dedup_ref,
    'recipient_override', p_recipient_override,
    'vars', p_vars
  );

  -- Blok 1: outbox upis. Mora biti odvojen od bloka slanja: plpgsql EXCEPTION
  -- radi rollback do početka bloka koji hvata iznimku, pa bi vanjski hvatač
  -- poništio i outbox red (i retry bi nemao što ponoviti).
  BEGIN
    INSERT INTO public.krug_notify_outbox (dedup_ref, event_type, payload)
    VALUES (_dedup_ref, p_event_type, _payload)
    ON CONFLICT (dedup_ref) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Blok 2: prvi pokušaj slanja. Kvar se bilježi i ne ruši čin (uzorak 0016).
  BEGIN
    SELECT decrypted_secret
      INTO _internal_key
      FROM vault.decrypted_secrets
     WHERE name = 'krug_notify_internal_key'
     LIMIT 1;

    IF _internal_key IS NULL OR length(_internal_key) = 0 THEN
      BEGIN
        INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
        VALUES (
          'krug_emit_error',
          'error',
          jsonb_build_object(
            'code', 'vault_key_missing',
            'message', 'krug_notify_internal_key missing from vault',
            'dedup_ref', _dedup_ref,
            'event_type', p_event_type
          ),
          _version
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
      RETURN;
    END IF;

    PERFORM net.http_post(
      url := _url,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey', _internal_key,
        'Authorization', 'Bearer ' || _internal_key
      ),
      body := _payload,
      timeout_milliseconds := 5000
    );

    UPDATE public.krug_notify_outbox
       SET attempts = attempts + 1
     WHERE dedup_ref = _dedup_ref;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
      VALUES (
        'krug_emit_error',
        'error',
        jsonb_build_object(
          'code', SQLSTATE,
          'message', left(SQLERRM, 300),
          'dedup_ref', _dedup_ref,
          'event_type', p_event_type
        ),
        _version
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.krug_emit_notification(text,uuid,uuid,uuid,uuid,text,uuid[],jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.krug_emit_notification(text,uuid,uuid,uuid,uuid,text,uuid[],jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.krug_notify_outbox_retry()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _url text := 'https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/notify-krug-event';
  _internal_key text;
  _version text := 'krug_notify_outbox_retry v1';
  _row record;
  _sent integer := 0;
BEGIN
  -- Konačni neuspjeh: jedan zapis po dedup_ref (radi i bez vault ključa).
  BEGIN
    INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
    SELECT 'krug_emit_failed',
           'error',
           jsonb_build_object(
             'code', 'max_attempts',
             'message', 'delivery failed after 5 attempts',
             'dedup_ref', o.dedup_ref,
             'event_type', o.event_type
           ),
           _version
      FROM public.krug_notify_outbox o
     WHERE o.delivered_at IS NULL
       AND o.attempts >= 5
       AND NOT EXISTS (
         SELECT 1
           FROM public.app_diagnostics_logs d
          WHERE d.event = 'krug_emit_failed'
            AND d.details ->> 'dedup_ref' = o.dedup_ref
       );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  SELECT decrypted_secret
    INTO _internal_key
    FROM vault.decrypted_secrets
   WHERE name = 'krug_notify_internal_key'
   LIMIT 1;

  IF _internal_key IS NULL OR length(_internal_key) = 0 THEN
    BEGIN
      INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
      VALUES (
        'krug_emit_error',
        'error',
        jsonb_build_object('code', 'vault_key_missing', 'message', 'krug_notify_internal_key missing from vault'),
        _version
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN 0;
  END IF;

  FOR _row IN
    SELECT dedup_ref, payload
      FROM public.krug_notify_outbox
     WHERE delivered_at IS NULL
       AND attempts < 5
       AND created_at < now() - interval '2 minutes'
     ORDER BY created_at
     LIMIT 50
  LOOP
    BEGIN
      PERFORM net.http_post(
        url := _url,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'apikey', _internal_key,
          'Authorization', 'Bearer ' || _internal_key
        ),
        body := _row.payload,
        timeout_milliseconds := 5000
      );
      UPDATE public.krug_notify_outbox
         SET attempts = attempts + 1,
             last_error = NULL
       WHERE dedup_ref = _row.dedup_ref;
      _sent := _sent + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.krug_notify_outbox
         SET attempts = attempts + 1,
             last_error = left(SQLERRM, 300)
       WHERE dedup_ref = _row.dedup_ref;
    END;
  END LOOP;

  RETURN _sent;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.app_diagnostics_logs (event, severity, details, app_version)
    VALUES (
      'krug_emit_error',
      'error',
      jsonb_build_object('code', SQLSTATE, 'message', left(SQLERRM, 300)),
      _version
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.krug_notify_outbox_retry() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.krug_notify_outbox_retry() TO service_role;
