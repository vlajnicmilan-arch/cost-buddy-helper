ALTER TABLE public.document_ingest_items
  ADD COLUMN IF NOT EXISTS scope_set_by_user boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.mail_item_set_scope(
  p_item_id uuid,
  p_scope_type text,
  p_scope_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.document_ingest_items%ROWTYPE;
  v_bpid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'nije_prijavljen'; END IF;
  IF p_scope_type NOT IN ('user', 'business_profile') THEN
    RAISE EXCEPTION 'neispravan_scope';
  END IF;

  SELECT * INTO v_item FROM public.document_ingest_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'stavka_ne_postoji'; END IF;

  -- Vlasnistvo: stavka mora biti u dosegu pozivatelja (vlasnik aliasa ili
  -- vlasnik tvrtke na koju je stavka trenutno usmjerena).
  IF COALESCE(v_item.owner_user_id, v_item.scope_id) <> v_uid THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.business_profiles bp
       WHERE bp.id = v_item.scope_id AND bp.user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'nije_dopusteno';
    END IF;
  END IF;

  IF v_item.status <> 'na_pregledu' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stanje_ne_dopusta');
  END IF;

  IF p_scope_type = 'business_profile' THEN
    SELECT id INTO v_bpid FROM public.business_profiles
      WHERE id = p_scope_id AND user_id = v_uid;
    IF v_bpid IS NULL THEN RAISE EXCEPTION 'nije_dopusteno'; END IF;
  END IF;

  UPDATE public.document_ingest_items
     SET scope_type = p_scope_type,
         scope_id = CASE WHEN p_scope_type = 'user' THEN v_uid ELSE v_bpid END,
         scope_set_by_user = true,
         updated_at = now()
   WHERE id = p_item_id;

  RETURN jsonb_build_object('ok', true, 'scope_type', p_scope_type);
END;
$function$;

REVOKE ALL ON FUNCTION public.mail_item_set_scope(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_item_set_scope(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mail_item_set_scope(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mail_ingest_retry_message(p_message_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_status text;
BEGIN
  SELECT owner_user_id, status INTO v_owner, v_status
    FROM public.inbound_messages WHERE id = p_message_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'poruka_ne_postoji'; END IF;
  IF v_owner <> auth.uid() THEN RAISE EXCEPTION 'nije_dopusteno'; END IF;

  -- 'zavrsena' je dopustena: ponovna obrada OSVJEZAVA postojecu stavku
  -- (upsert po message_id+attachment_id), nikad ne stvara duplikat.
  IF v_status NOT IN ('neuspjela', 'neuspjela_konacno', 'zaustavljena_branom', 'ceka_kvotu', 'zavrsena') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stanje_ne_dopusta');
  END IF;

  UPDATE public.inbound_messages
     SET status = 'primljena', last_error = NULL, updated_at = now()
   WHERE id = p_message_id;

  INSERT INTO public.ingest_jobs (message_id, status, attempts, next_run_at)
  SELECT p_message_id, 'ceka', 0, now()
   WHERE NOT EXISTS (SELECT 1 FROM public.ingest_jobs WHERE message_id = p_message_id);

  UPDATE public.ingest_jobs
     SET status = 'ceka', attempts = 0, next_run_at = now(),
         last_error = NULL, locked_at = NULL, updated_at = now()
   WHERE message_id = p_message_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;