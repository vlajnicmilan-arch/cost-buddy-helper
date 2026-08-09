-- KVAR 1: atomski claim + terminalna stanja + reaper -----------------------

-- 1a) Claim SAMO iz 'ceka'. Zaglavljene poslove rješava reaper, ne claim.
CREATE OR REPLACE FUNCTION public.mail_ingest_claim_jobs(p_limit integer DEFAULT 5)
 RETURNS TABLE(job_id uuid, message_id uuid, attempts integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.ingest_jobs j
     SET status = 'u_obradi',
         locked_at = now(),
         attempts = j.attempts + 1,
         updated_at = now()
   WHERE j.id IN (
     SELECT c.id FROM public.ingest_jobs c
      WHERE c.status = 'ceka'
        AND c.next_run_at <= now()
      ORDER BY c.next_run_at ASC
      LIMIT GREATEST(p_limit, 1)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING j.id, j.message_id, j.attempts;
END;
$function$;

-- 1b) Finish job — statusi MORAJU biti iz ingest_jobs_status_check
--     ('ceka','u_obradi','zavrsen','neuspjeo'). Prijasnje vrijednosti
--     ('gotov','neuspjela_konacno') su rusile CHECK, transakcija je padala i
--     posao je ostajao 'u_obradi' -> beskonacna petlja.
CREATE OR REPLACE FUNCTION public.mail_ingest_finish_job(p_job_id uuid, p_ok boolean, p_error text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_attempts integer;
  v_message uuid;
  v_next text;
BEGIN
  SELECT attempts, message_id INTO v_attempts, v_message
    FROM public.ingest_jobs WHERE id = p_job_id FOR UPDATE;
  IF v_message IS NULL THEN RETURN 'nepoznat_posao'; END IF;

  IF p_ok THEN
    UPDATE public.ingest_jobs
       SET status = 'zavrsen', last_error = NULL, locked_at = NULL, updated_at = now()
     WHERE id = p_job_id;
    UPDATE public.inbound_messages
       SET status = 'zavrsena', processed_at = now(), last_error = NULL, updated_at = now()
     WHERE id = v_message
       AND status NOT IN ('ceka_kvotu', 'zaustavljena_branom', 'obrisana');
    RETURN 'zavrsen';
  END IF;

  IF COALESCE(v_attempts, 0) >= 3 THEN
    v_next := 'neuspjeo';
    UPDATE public.ingest_jobs
       SET status = 'neuspjeo', last_error = p_error, locked_at = NULL, updated_at = now()
     WHERE id = p_job_id;
    UPDATE public.inbound_messages
       SET status = 'neuspjela_konacno', last_error = p_error, updated_at = now()
     WHERE id = v_message;
  ELSE
    v_next := 'ceka';
    UPDATE public.ingest_jobs
       SET status = 'ceka',
           last_error = p_error,
           locked_at = NULL,
           next_run_at = now() + (CASE COALESCE(v_attempts, 0)
                                    WHEN 1 THEN interval '1 minute'
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
$function$;

-- 1c) Stuck-job reaper: 'u_obradi' stariji od N minuta = pao.
CREATE OR REPLACE FUNCTION public.mail_ingest_reap_stuck_jobs(p_older_minutes integer DEFAULT 15)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job record;
  v_count integer := 0;
BEGIN
  FOR v_job IN
    SELECT id, attempts, message_id
      FROM public.ingest_jobs
     WHERE status = 'u_obradi'
       AND COALESCE(locked_at, updated_at, created_at)
             < now() - make_interval(mins => GREATEST(COALESCE(p_older_minutes, 15), 1))
     ORDER BY locked_at NULLS FIRST
     LIMIT 100
     FOR UPDATE SKIP LOCKED
  LOOP
    IF COALESCE(v_job.attempts, 0) >= 3 THEN
      UPDATE public.ingest_jobs
         SET status = 'neuspjeo',
             last_error = COALESCE(last_error, 'zombie_job_reaped'),
             locked_at = NULL,
             updated_at = now()
       WHERE id = v_job.id;
      UPDATE public.inbound_messages
         SET status = 'neuspjela_konacno',
             last_error = COALESCE(last_error, 'zombie_job_reaped'),
             updated_at = now()
       WHERE id = v_job.message_id;
    ELSE
      UPDATE public.ingest_jobs
         SET status = 'ceka',
             last_error = COALESCE(last_error, 'zombie_job_reaped'),
             locked_at = NULL,
             next_run_at = now() + interval '1 minute',
             updated_at = now()
       WHERE id = v_job.id;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.mail_ingest_reap_stuck_jobs(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_ingest_reap_stuck_jobs(integer) TO service_role;

-- 1d) Retry: posao mora zavrsiti u dopustenom statusu i kad ga korisnik gura rucno.
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

  IF v_status NOT IN ('neuspjela', 'neuspjela_konacno', 'zaustavljena_branom', 'ceka_kvotu') THEN
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

-- KVAR 2: prazan OIB/broj + idempotentna potvrda ----------------------------

CREATE OR REPLACE FUNCTION public.mail_item_confirm(p_item_id uuid, p_payload jsonb, p_replace_existing_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.document_ingest_items%ROWTYPE;
  v_bpid uuid;
  v_invoice_id uuid;
  v_linked uuid;
  v_existing public.incoming_invoices%ROWTYPE;
  v_direction text := COALESCE(p_payload->>'direction', 'in');
  v_doc_type text := COALESCE(p_payload->>'doc_type', '380');
  v_oib text := NULLIF(btrim(COALESCE(p_payload->>'supplier_oib', '')), '');
  v_number text := NULLIF(btrim(COALESCE(p_payload->>'invoice_number', '')), '');
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

  -- IDEMPOTENCIJA: ista stavka (ili bilo koja stavka iste poruke) vec je
  -- povezana s ulaznim racunom -> vrati postojeci, NIKAD drugi insert.
  SELECT dl.target_id INTO v_linked
    FROM public.document_links dl
    JOIN public.document_ingest_items it ON it.id = dl.item_id
   WHERE dl.target_type = 'incoming_invoice'
     AND (
       dl.item_id = p_item_id
       OR (v_item.message_id IS NOT NULL AND it.message_id = v_item.message_id)
     )
   ORDER BY (dl.item_id = p_item_id) DESC, dl.created_at ASC
   LIMIT 1;

  IF v_linked IS NOT NULL THEN
    UPDATE public.document_ingest_items
       SET status = 'povezan', updated_at = now()
     WHERE id = p_item_id AND status <> 'povezan';

    INSERT INTO public.document_links (item_id, target_type, target_id)
    SELECT p_item_id, 'incoming_invoice', v_linked
     WHERE NOT EXISTS (SELECT 1 FROM public.document_links WHERE item_id = p_item_id);

    RETURN jsonb_build_object('ok', true, 'invoice_id', v_linked, 'already', true);
  END IF;

  IF v_item.status <> 'na_pregledu' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stanje_ne_dopusta');
  END IF;

  IF v_oib IS NULL OR v_number IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nedostaju_polja');
  END IF;

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
      COALESCE(p_payload->>'fingerprint',
               encode(extensions.digest(v_oib || '|' || v_number, 'sha256'), 'hex')),
      p_payload->>'source_filename',
      p_payload->>'note'
    ) RETURNING id INTO v_invoice_id;
  END IF;

  INSERT INTO public.document_links (item_id, target_type, target_id)
  VALUES (p_item_id, 'incoming_invoice', v_invoice_id)
  ON CONFLICT (item_id) DO UPDATE SET target_id = EXCLUDED.target_id;

  UPDATE public.document_ingest_items
     SET status = 'povezan',
         extraction = COALESCE(p_payload, extraction),
         doc_type = v_doc_type,
         updated_at = now()
   WHERE id = p_item_id;

  RETURN jsonb_build_object('ok', true, 'invoice_id', v_invoice_id, 'replaced', v_existing.id IS NOT NULL, 'already', false);
END;
$function$;