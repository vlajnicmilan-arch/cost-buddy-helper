-- Uklanjamo staru inačicu da NE nastane dvostruka funkcija (overload).
DROP FUNCTION IF EXISTS public.mail_ingest_store_message(uuid, uuid, text, text, text, text, timestamptz, text, text, text, text, text, bigint, jsonb);

CREATE OR REPLACE FUNCTION public.mail_ingest_store_message(
  p_owner_user_id uuid,
  p_alias_id uuid,
  p_provider text,
  p_provider_event_id text,
  p_from_header text,
  p_subject text,
  p_received_at timestamptz,
  p_spf_result text,
  p_dkim_result text,
  p_arc_result text,
  p_dmarc_result text,
  p_body_storage_path text,
  p_size_bytes bigint,
  p_attachments jsonb DEFAULT '[]'::jsonb,
  p_dam_reason text DEFAULT NULL
)
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
    body_storage_path, size_bytes, status, last_error
  ) VALUES (
    p_owner_user_id, p_alias_id, p_provider, p_provider_event_id, p_from_header, p_subject,
    COALESCE(p_received_at, now()), p_spf_result, p_dkim_result, p_arc_result, p_dmarc_result,
    p_body_storage_path, p_size_bytes, v_status, p_dam_reason
  ) RETURNING id INTO v_message_id;

  FOR v_att IN SELECT * FROM jsonb_array_elements(COALESCE(p_attachments, '[]'::jsonb))
  LOOP
    INSERT INTO public.inbound_attachments (
      message_id, storage_path, mime_declared, size_bytes, content_sha256
    ) VALUES (
      v_message_id,
      v_att->>'storage_path',
      v_att->>'mime_declared',
      NULLIF(v_att->>'size_bytes','')::bigint,
      NULLIF(v_att->>'content_sha256','')
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

REVOKE EXECUTE ON FUNCTION public.mail_ingest_store_message(uuid, uuid, text, text, text, text, timestamptz, text, text, text, text, text, bigint, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_ingest_store_message(uuid, uuid, text, text, text, text, timestamptz, text, text, text, text, text, bigint, jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION public.mail_ingest_rate_counts(p_alias_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'last_hour', COUNT(*) FILTER (WHERE received_at > now() - interval '1 hour'),
    'last_day',  COUNT(*) FILTER (WHERE received_at > now() - interval '1 day')
  )
  FROM public.inbound_messages
  WHERE alias_id = p_alias_id;
$$;

REVOKE EXECUTE ON FUNCTION public.mail_ingest_rate_counts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_ingest_rate_counts(uuid) TO service_role;

-- Čišćenje sirovih poruka zaustavljenih branom starijih od 7 dana.
CREATE OR REPLACE FUNCTION public.mail_ingest_cleanup_dammed()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  WITH deleted AS (
    UPDATE public.inbound_messages
       SET status = 'obrisana', updated_at = now()
     WHERE status = 'zaustavljena_branom'
       AND received_at < now() - interval '7 days'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM deleted;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mail_ingest_cleanup_dammed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_ingest_cleanup_dammed() TO service_role;

CREATE INDEX IF NOT EXISTS idx_inbound_attachments_sha
  ON public.inbound_attachments (content_sha256);