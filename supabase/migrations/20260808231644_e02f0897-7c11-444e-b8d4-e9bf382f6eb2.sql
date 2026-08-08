-- ─────────────── 1. Aditivni stupci ───────────────
ALTER TABLE public.inbound_attachments
  ADD COLUMN IF NOT EXISTS content_sha256 text,
  ADD COLUMN IF NOT EXISTS incomplete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quarantine_reason text;

CREATE INDEX IF NOT EXISTS idx_inbound_attachments_sha
  ON public.inbound_attachments (content_sha256) WHERE content_sha256 IS NOT NULL;

ALTER TABLE public.inbound_messages
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_inbound_messages_alias_received
  ON public.inbound_messages (alias_id, received_at DESC);

ALTER TABLE public.ingest_jobs
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_ready
  ON public.ingest_jobs (status, next_run_at);

ALTER TABLE public.document_ingest_items
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.inbound_messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS trust_level text,
  ADD COLUMN IF NOT EXISTS warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS doc_type text,
  ADD COLUMN IF NOT EXISTS duplicate_of_item_id uuid REFERENCES public.document_ingest_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_calls integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_dii_owner_status
  ON public.document_ingest_items (owner_user_id, status, created_at DESC);

-- ─────────────── 2. Mjesečno brojilo obrade ───────────────
CREATE TABLE IF NOT EXISTS public.mail_import_usage_monthly (
  user_id uuid NOT NULL,
  period_month date NOT NULL,
  processed_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period_month)
);

GRANT SELECT ON public.mail_import_usage_monthly TO authenticated;
GRANT ALL ON public.mail_import_usage_monthly TO service_role;

ALTER TABLE public.mail_import_usage_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own mail import usage"
  ON public.mail_import_usage_monthly FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ─────────────── 3. Atomsko preuzimanje posla ───────────────
CREATE OR REPLACE FUNCTION public.mail_ingest_claim_jobs(p_limit integer DEFAULT 5)
RETURNS TABLE (job_id uuid, message_id uuid, attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.ingest_jobs j
     SET status = 'u_obradi',
         locked_at = now(),
         attempts = j.attempts + 1,
         updated_at = now()
   WHERE j.id IN (
     SELECT c.id FROM public.ingest_jobs c
      WHERE (c.status IN ('ceka', 'neuspjela') AND c.next_run_at <= now())
         OR (c.status = 'u_obradi' AND c.locked_at < now() - interval '10 minutes')
      ORDER BY c.next_run_at ASC
      LIMIT GREATEST(p_limit, 1)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING j.id, j.message_id, j.attempts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mail_ingest_claim_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_ingest_claim_jobs(integer) TO service_role;

-- ─────────────── 4. Zaključivanje posla (retry x3, backoff) ───────────────
CREATE OR REPLACE FUNCTION public.mail_ingest_finish_job(
  p_job_id uuid,
  p_ok boolean,
  p_error text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_attempts integer;
  v_message uuid;
  v_next text;
BEGIN
  SELECT attempts, message_id INTO v_attempts, v_message
    FROM public.ingest_jobs WHERE id = p_job_id;
  IF v_message IS NULL THEN RETURN 'nepoznat_posao'; END IF;

  IF p_ok THEN
    UPDATE public.ingest_jobs SET status = 'gotov', last_error = NULL, updated_at = now()
      WHERE id = p_job_id;
    UPDATE public.inbound_messages
       SET status = 'zavrsena', processed_at = now(), last_error = NULL, updated_at = now()
     WHERE id = v_message;
    RETURN 'gotov';
  END IF;

  IF v_attempts >= 3 THEN
    v_next := 'neuspjela_konacno';
    UPDATE public.ingest_jobs
       SET status = 'neuspjela_konacno', last_error = p_error, updated_at = now()
     WHERE id = p_job_id;
    UPDATE public.inbound_messages
       SET status = 'neuspjela_konacno', last_error = p_error, updated_at = now()
     WHERE id = v_message;
  ELSE
    v_next := 'ceka';
    UPDATE public.ingest_jobs
       SET status = 'ceka',
           last_error = p_error,
           next_run_at = now() + (CASE v_attempts WHEN 1 THEN interval '1 minute'
                                                  WHEN 2 THEN interval '5 minutes'
                                                  ELSE interval '15 minutes' END),
           updated_at = now()
     WHERE id = p_job_id;
    UPDATE public.inbound_messages
       SET status = 'neuspjela', last_error = p_error, updated_at = now()
     WHERE id = v_message;
  END IF;

  RETURN v_next;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mail_ingest_finish_job(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_ingest_finish_job(uuid, boolean, text) TO service_role;

-- ─────────────── 5. Ručni ponovni pokušaj (vlasnik) ───────────────
CREATE OR REPLACE FUNCTION public.mail_ingest_retry_message(p_message_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
  v_status text;
BEGIN
  SELECT owner_user_id, status INTO v_owner, v_status
    FROM public.inbound_messages WHERE id = p_message_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'poruka_ne_postoji'; END IF;
  IF v_owner <> auth.uid() THEN RAISE EXCEPTION 'nije_dopusteno'; END IF;

  IF v_status NOT IN ('neuspjela', 'neuspjela_konacno', 'zaustavljena_branom', 'ceka_kvotu') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stanje_ne_dopusta');
  END IF;

  UPDATE public.inbound_messages
     SET status = 'primljena', last_error = NULL, updated_at = now()
   WHERE id = p_message_id;

  INSERT INTO public.ingest_jobs (message_id, status, attempts, next_run_at)
  VALUES (p_message_id, 'ceka', 0, now())
  ON CONFLICT DO NOTHING;

  UPDATE public.ingest_jobs
     SET status = 'ceka', attempts = 0, next_run_at = now(), last_error = NULL, updated_at = now()
   WHERE message_id = p_message_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mail_ingest_retry_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_ingest_retry_message(uuid) TO authenticated, service_role;

-- ─────────────── 6. Kvota obrade ───────────────
CREATE OR REPLACE FUNCTION public.mail_import_quota_status(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit integer;
  v_used integer;
BEGIN
  v_limit := CASE WHEN public.has_entitlement(p_user_id, 'mail_uvoz') THEN 100 ELSE 5 END;
  SELECT COALESCE(processed_count, 0) INTO v_used
    FROM public.mail_import_usage_monthly
   WHERE user_id = p_user_id AND period_month = date_trunc('month', now())::date;
  RETURN jsonb_build_object('limit', v_limit, 'used', COALESCE(v_used, 0));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mail_import_quota_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_import_quota_status(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mail_import_consume_quota(p_user_id uuid, p_count integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit integer;
  v_month date := date_trunc('month', now())::date;
  v_used integer;
BEGIN
  v_limit := CASE WHEN public.has_entitlement(p_user_id, 'mail_uvoz') THEN 100 ELSE 5 END;

  INSERT INTO public.mail_import_usage_monthly (user_id, period_month, processed_count)
  VALUES (p_user_id, v_month, 0)
  ON CONFLICT (user_id, period_month) DO NOTHING;

  SELECT processed_count INTO v_used
    FROM public.mail_import_usage_monthly
   WHERE user_id = p_user_id AND period_month = v_month
     FOR UPDATE;

  IF v_used + p_count > v_limit THEN
    RETURN jsonb_build_object('allowed', false, 'limit', v_limit, 'used', v_used);
  END IF;

  UPDATE public.mail_import_usage_monthly
     SET processed_count = processed_count + p_count, updated_at = now()
   WHERE user_id = p_user_id AND period_month = v_month;

  RETURN jsonb_build_object('allowed', true, 'limit', v_limit, 'used', v_used + p_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mail_import_consume_quota(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_import_consume_quota(uuid, integer) TO service_role;

-- ─────────────── 7. Potvrda stavke — JEDNA transakcija ───────────────
CREATE OR REPLACE FUNCTION public.mail_item_confirm(
  p_item_id uuid,
  p_payload jsonb,
  p_replace_existing_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.document_ingest_items%ROWTYPE;
  v_bpid uuid;
  v_invoice_id uuid;
  v_existing public.incoming_invoices%ROWTYPE;
  v_direction text := COALESCE(p_payload->>'direction', 'in');
  v_doc_type text := COALESCE(p_payload->>'doc_type', '380');
  v_oib text := p_payload->>'supplier_oib';
  v_number text := p_payload->>'invoice_number';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'nije_prijavljen'; END IF;

  SELECT * INTO v_item FROM public.document_ingest_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'stavka_ne_postoji'; END IF;

  IF v_item.scope_type = 'user' THEN
    IF v_item.scope_id <> v_uid THEN RAISE EXCEPTION 'nije_dopusteno'; END IF;
    v_bpid := NULL;
  ELSE
    SELECT id INTO v_bpid FROM public.business_profiles
      WHERE id = v_item.scope_id AND user_id = v_uid;
    IF v_bpid IS NULL THEN RAISE EXCEPTION 'nije_dopusteno'; END IF;
  END IF;

  IF v_item.status <> 'na_pregledu' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stanje_ne_dopusta');
  END IF;

  IF v_oib IS NULL OR v_number IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nedostaju_polja');
  END IF;

  -- Kolizija na novim unique indeksima: NIKAD tiha zamjena.
  SELECT * INTO v_existing FROM public.incoming_invoices
   WHERE direction = v_direction
     AND supplier_oib = v_oib
     AND invoice_number = v_number
     AND doc_type = v_doc_type
     AND ((v_bpid IS NULL AND business_profile_id IS NULL AND user_id = v_uid)
       OR (v_bpid IS NOT NULL AND business_profile_id = v_bpid));

  IF v_existing.id IS NOT NULL AND p_replace_existing_id IS DISTINCT FROM v_existing.id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'mozda_vec_postoji',
      'existing', to_jsonb(v_existing)
    );
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.incoming_invoices SET
      supplier_name   = COALESCE(p_payload->>'supplier_name', supplier_name),
      issue_date      = COALESCE(NULLIF(p_payload->>'issue_date','')::date, issue_date),
      due_date        = COALESCE(NULLIF(p_payload->>'due_date','')::date, due_date),
      total_amount    = COALESCE(NULLIF(p_payload->>'total_amount','')::numeric, total_amount),
      vat_amount      = COALESCE(NULLIF(p_payload->>'vat_amount','')::numeric, vat_amount),
      iban            = COALESCE(p_payload->>'iban', iban),
      items           = COALESCE(p_payload->'items', items),
      source_filename = COALESCE(p_payload->>'source_filename', source_filename),
      note            = COALESCE(p_payload->>'note', note),
      updated_at      = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_invoice_id;
  ELSE
    INSERT INTO public.incoming_invoices (
      user_id, business_profile_id, direction, doc_type,
      supplier_oib, supplier_name, invoice_number,
      issue_date, due_date, total_amount, vat_amount, currency,
      iban, items, fingerprint, source_filename, note
    ) VALUES (
      v_uid, v_bpid, v_direction, v_doc_type,
      v_oib, p_payload->>'supplier_name', v_number,
      NULLIF(p_payload->>'issue_date','')::date,
      NULLIF(p_payload->>'due_date','')::date,
      COALESCE(NULLIF(p_payload->>'total_amount','')::numeric, 0),
      NULLIF(p_payload->>'vat_amount','')::numeric,
      COALESCE(p_payload->>'currency', 'EUR'),
      p_payload->>'iban',
      COALESCE(p_payload->'items', '[]'::jsonb),
      COALESCE(p_payload->>'fingerprint', encode(digest(v_oib || '|' || v_number, 'sha256'), 'hex')),
      p_payload->>'source_filename',
      p_payload->>'note'
    ) RETURNING id INTO v_invoice_id;
  END IF;

  INSERT INTO public.document_links (item_id, target_type, target_id)
  VALUES (p_item_id, 'incoming_invoice', v_invoice_id);

  UPDATE public.document_ingest_items
     SET status = 'povezan',
         extraction = COALESCE(p_payload, extraction),
         doc_type = v_doc_type,
         updated_at = now()
   WHERE id = p_item_id;

  RETURN jsonb_build_object('ok', true, 'invoice_id', v_invoice_id, 'replaced', v_existing.id IS NOT NULL);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mail_item_confirm(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_item_confirm(uuid, jsonb, uuid) TO authenticated, service_role;