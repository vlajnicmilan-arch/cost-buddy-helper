ALTER TABLE public.inbound_messages
  ADD COLUMN IF NOT EXISTS list_unsubscribe text,
  ADD COLUMN IF NOT EXISTS list_id text,
  ADD COLUMN IF NOT EXISTS precedence text,
  ADD COLUMN IF NOT EXISTS auto_submitted text;

CREATE OR REPLACE FUNCTION public.mail_ingest_store_message(p_owner_user_id uuid, p_alias_id uuid, p_provider text, p_provider_event_id text, p_from_header text, p_subject text, p_received_at timestamp with time zone, p_spf_result text, p_dkim_result text, p_arc_result text, p_dmarc_result text, p_body_storage_path text, p_size_bytes bigint, p_attachments jsonb DEFAULT '[]'::jsonb, p_dam_reason text DEFAULT NULL::text, p_list_unsubscribe text DEFAULT NULL::text, p_list_id text DEFAULT NULL::text, p_precedence text DEFAULT NULL::text, p_auto_submitted text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_message_id uuid;
  v_existing uuid;
  v_att jsonb;
  v_status text := CASE WHEN p_dam_reason IS NULL THEN 'primljena' ELSE 'zaustavljena_branom' END;
BEGIN
  SELECT id INTO v_existing FROM public.inbound_messages
    WHERE provider = p_provider AND provider_event_id = p_provider_event_id;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('message_id', v_existing, 'replay', true);
  END IF;

  INSERT INTO public.inbound_messages (
    owner_user_id, alias_id, provider, provider_event_id, from_header, subject,
    received_at, spf_result, dkim_result, arc_result, dmarc_result,
    body_storage_path, size_bytes, status, last_error,
    list_unsubscribe, list_id, precedence, auto_submitted
  ) VALUES (
    p_owner_user_id, p_alias_id, p_provider, p_provider_event_id, p_from_header, p_subject,
    COALESCE(p_received_at, now()), p_spf_result, p_dkim_result, p_arc_result, p_dmarc_result,
    p_body_storage_path, p_size_bytes, v_status, p_dam_reason,
    NULLIF(p_list_unsubscribe, ''), NULLIF(p_list_id, ''), NULLIF(p_precedence, ''), NULLIF(p_auto_submitted, '')
  ) RETURNING id INTO v_message_id;

  FOR v_att IN SELECT * FROM jsonb_array_elements(COALESCE(p_attachments, '[]'::jsonb))
  LOOP
    INSERT INTO public.inbound_attachments (
      message_id, storage_path, mime_declared, size_bytes, content_sha256,
      incomplete, quarantine_reason
    ) VALUES (
      v_message_id,
      v_att->>'storage_path',
      v_att->>'mime_declared',
      NULLIF(v_att->>'size_bytes','')::bigint,
      NULLIF(v_att->>'content_sha256',''),
      COALESCE((v_att->>'incomplete')::boolean, false),
      NULLIF(v_att->>'quarantine_reason','')
    );
  END LOOP;

  -- Brana: poruka je spremljena SIROVA, ali posao NE ulazi u red.
  IF p_dam_reason IS NULL THEN
    INSERT INTO public.ingest_jobs (message_id) VALUES (v_message_id);
  END IF;

  RETURN jsonb_build_object(
    'message_id', v_message_id,
    'replay', false,
    'dammed', p_dam_reason IS NOT NULL
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.mail_ingest_store_message(uuid, uuid, text, text, text, text, timestamptz, text, text, text, text, text, bigint, jsonb, text);

REVOKE ALL ON FUNCTION public.mail_ingest_store_message(uuid, uuid, text, text, text, text, timestamptz, text, text, text, text, text, bigint, jsonb, text, text, text, text, text) FROM anon;