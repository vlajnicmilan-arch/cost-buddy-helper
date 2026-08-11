ALTER TABLE public.custom_payment_sources ADD COLUMN IF NOT EXISTS account_identifier text;
ALTER TABLE public.document_ingest_items ADD COLUMN IF NOT EXISTS classification_set_by_user boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.mail_item_reprocess(p_item_id uuid, p_classification text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_msg uuid;
  v_res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nije_prijavljen');
  END IF;

  SELECT owner_user_id, message_id INTO v_owner, v_msg
    FROM public.document_ingest_items WHERE id = p_item_id;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stavka_ne_postoji');
  END IF;
  IF v_owner <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nije_dopusteno');
  END IF;
  IF v_msg IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'poruka_ne_postoji');
  END IF;

  -- Korisnikova odluka o vrsti dokumenta je ODLUKA: pamti se i ponovna obrada
  -- je ne smije pregaziti strojnom klasifikacijom.
  IF p_classification IS NOT NULL THEN
    UPDATE public.document_ingest_items
       SET classification = p_classification,
           classification_set_by_user = true,
           status = 'na_pregledu',
           updated_at = now()
     WHERE id = p_item_id;
  END IF;

  v_res := public.mail_ingest_retry_message(v_msg);
  RETURN v_res || jsonb_build_object('message_id', v_msg);
END;
$function$;

REVOKE ALL ON FUNCTION public.mail_item_reprocess(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_item_reprocess(uuid, text) TO authenticated;