-- 1) SANACIJA: po korisniku ostaje aktivan NAJSTARIJI alias, noviji se gase.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.mail_aliases
  WHERE disabled_at IS NULL
)
UPDATE public.mail_aliases a
SET disabled_at = now()
FROM ranked r
WHERE a.id = r.id AND r.rn > 1;

-- 2) Najviše JEDAN aktivan alias po korisniku.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mail_alias_active_per_user
  ON public.mail_aliases (user_id)
  WHERE disabled_at IS NULL;

-- 3) Generator lokalnog dijela: 'c-' + 16 znakova iz [a-z2-9].
CREATE OR REPLACE FUNCTION public.mail_alias_generate_local()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_alphabet CONSTANT text := 'abcdefghijklmnopqrstuvwxyz23456789';
  v_out text := '';
  i int;
BEGIN
  FOR i IN 1..16 LOOP
    v_out := v_out || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  END LOOP;
  RETURN 'c-' || v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.mail_alias_generate_local() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_alias_generate_local() TO authenticated, service_role;

-- 4) GET-OR-CREATE: nikad ne stvara drugi aktivan alias.
CREATE OR REPLACE FUNCTION public.mail_alias_get_or_create()
RETURNS TABLE (id uuid, alias_local text, created_at timestamptz, disabled_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_try int := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT a.id INTO v_id
  FROM public.mail_aliases a
  WHERE a.user_id = v_user AND a.disabled_at IS NULL
  ORDER BY a.created_at ASC
  LIMIT 1;

  WHILE v_id IS NULL AND v_try < 5 LOOP
    v_try := v_try + 1;
    BEGIN
      INSERT INTO public.mail_aliases (user_id, alias_local)
      VALUES (v_user, public.mail_alias_generate_local())
      RETURNING mail_aliases.id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT a.id INTO v_id
      FROM public.mail_aliases a
      WHERE a.user_id = v_user AND a.disabled_at IS NULL
      ORDER BY a.created_at ASC
      LIMIT 1;
    END;
  END LOOP;

  RETURN QUERY
  SELECT a.id, a.alias_local, a.created_at, a.disabled_at
  FROM public.mail_aliases a
  WHERE a.id = v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.mail_alias_get_or_create() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_alias_get_or_create() TO authenticated;

-- 5) REGENERACIJA: gasi staru i stvara novu u ISTOJ transakciji.
CREATE OR REPLACE FUNCTION public.mail_alias_regenerate()
RETURNS TABLE (id uuid, alias_local text, created_at timestamptz, disabled_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.mail_aliases
  SET disabled_at = now()
  WHERE user_id = v_user AND disabled_at IS NULL;

  INSERT INTO public.mail_aliases (user_id, alias_local)
  VALUES (v_user, public.mail_alias_generate_local())
  RETURNING mail_aliases.id INTO v_id;

  RETURN QUERY
  SELECT a.id, a.alias_local, a.created_at, a.disabled_at
  FROM public.mail_aliases a
  WHERE a.id = v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.mail_alias_regenerate() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_alias_regenerate() TO authenticated;

-- 6) Prijem: privitak može biti zabilježen kao nepotpun (npr. prevelik) — nikad tiho.
CREATE OR REPLACE FUNCTION public.mail_ingest_store_message(p_owner_user_id uuid, p_alias_id uuid, p_provider text, p_provider_event_id text, p_from_header text, p_subject text, p_received_at timestamp with time zone, p_spf_result text, p_dkim_result text, p_arc_result text, p_dmarc_result text, p_body_storage_path text, p_size_bytes bigint, p_attachments jsonb DEFAULT '[]'::jsonb, p_dam_reason text DEFAULT NULL::text)
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
REVOKE ALL ON FUNCTION public.mail_ingest_store_message(uuid,uuid,text,text,text,text,timestamptz,text,text,text,text,text,bigint,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_ingest_store_message(uuid,uuid,text,text,text,text,timestamptz,text,text,text,text,text,bigint,jsonb,text) TO service_role;