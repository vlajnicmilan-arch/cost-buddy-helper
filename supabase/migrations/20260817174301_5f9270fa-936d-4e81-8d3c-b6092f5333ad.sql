ALTER TABLE public.ingest_jobs ADD COLUMN IF NOT EXISTS manual boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.mail_ingest_claim_jobs(integer);

CREATE OR REPLACE FUNCTION public.mail_ingest_claim_jobs(p_limit integer DEFAULT 5)
 RETURNS TABLE(job_id uuid, message_id uuid, attempts integer, manual boolean)
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
  RETURNING j.id, j.message_id, j.attempts, j.manual;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mail_ingest_claim_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_ingest_claim_jobs(integer) TO service_role;

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

  -- Ovu funkciju poziva ISKLJUCIVO prijavljeni korisnik: posao je RUCNI
  -- (manual = true) i samo takav smije zazvoniti za staru poruku.
  INSERT INTO public.ingest_jobs (message_id, status, attempts, next_run_at, manual)
  SELECT p_message_id, 'ceka', 0, now(), true
   WHERE NOT EXISTS (SELECT 1 FROM public.ingest_jobs WHERE message_id = p_message_id);

  UPDATE public.ingest_jobs
     SET status = 'ceka', attempts = 0, next_run_at = now(),
         last_error = NULL, locked_at = NULL, manual = true, updated_at = now()
   WHERE message_id = p_message_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;