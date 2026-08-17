-- MAIL LIJEVAK — nesigurno nikad ne nestaje.
-- 1) Nova nedestruktivna stanja stavke: 'zadrzano' (korisnik kaže „nešto drugo,
--    zadrži") i 'ceka_prvi_mail' (Gmail potvrda nakon korisnikova klika).
ALTER TABLE public.document_ingest_items
  DROP CONSTRAINT IF EXISTS document_ingest_items_status_check;

ALTER TABLE public.document_ingest_items
  ADD CONSTRAINT document_ingest_items_status_check CHECK (status = ANY (ARRAY[
    'klasificiran','izvucen','na_pregledu','potvrdjen','povezan',
    'nije_za_nas','odbaceno','odbacio_korisnik','zadrzano','ceka_prvi_mail'
  ]));

-- 2) Trag životnog ciklusa Gmail potvrde.
ALTER TABLE public.document_ingest_items
  ADD COLUMN IF NOT EXISTS verification_clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_reactivated_at timestamptz;

-- 3) RASKRIŽJE: nedestruktivne odluke korisnika nad stavkom na pregledu.
--    Samo izričiti 'odbaci' vodi u 'odbacio_korisnik'.
CREATE OR REPLACE FUNCTION public.mail_item_decide(p_item_id uuid, p_decision text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_status text;
  v_next text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nije_prijavljen');
  END IF;

  IF p_decision NOT IN ('zadrzi', 'odbaci') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nepoznata_odluka');
  END IF;

  SELECT owner_user_id, status INTO v_owner, v_status
    FROM public.document_ingest_items WHERE id = p_item_id;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stavka_ne_postoji');
  END IF;
  IF v_owner <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nije_dopusteno');
  END IF;

  v_next := CASE WHEN p_decision = 'zadrzi' THEN 'zadrzano' ELSE 'odbacio_korisnik' END;

  UPDATE public.document_ingest_items
     SET status = v_next,
         updated_at = now()
   WHERE id = p_item_id;

  RETURN jsonb_build_object('ok', true, 'status', v_next);
END;
$function$;

REVOKE ALL ON FUNCTION public.mail_item_decide(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_item_decide(uuid, text) TO authenticated;

-- 4) Gmail potvrda: korisnik je kliknuo „Otvori potvrdu" → stavka odmah napušta
--    red „Na pregled" (postojeći okidač gasi obavijest) i čeka prvi mail.
CREATE OR REPLACE FUNCTION public.mail_verification_clicked(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_classification text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nije_prijavljen');
  END IF;

  SELECT owner_user_id, classification INTO v_owner, v_classification
    FROM public.document_ingest_items WHERE id = p_item_id;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stavka_ne_postoji');
  END IF;
  IF v_owner <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nije_dopusteno');
  END IF;
  IF v_classification IS DISTINCT FROM 'verifikacija_prosljedjivanja' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nije_verifikacija');
  END IF;

  UPDATE public.document_ingest_items
     SET status = 'ceka_prvi_mail',
         verification_clicked_at = now(),
         updated_at = now()
   WHERE id = p_item_id;

  RETURN jsonb_build_object('ok', true, 'status', 'ceka_prvi_mail');
END;
$function$;

REVOKE ALL ON FUNCTION public.mail_verification_clicked(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mail_verification_clicked(uuid) TO authenticated;

-- 5) JEDNOM, nakon 7 dana bez ijednog maila s te adrese: tihi povratak na
--    pregled s poštenim upozorenjem. `verification_reactivated_at` jamči da se
--    ovo nikad ne ponovi za istu stavku.
CREATE OR REPLACE FUNCTION public.mail_verification_reactivate_stale()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row record;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT id, owner_user_id, warnings
      FROM public.document_ingest_items
     WHERE classification = 'verifikacija_prosljedjivanja'
       AND status = 'ceka_prvi_mail'
       AND verification_clicked_at IS NOT NULL
       AND verification_clicked_at < now() - interval '7 days'
       AND verification_reactivated_at IS NULL
  LOOP
    UPDATE public.document_ingest_items
       SET status = 'na_pregledu',
           verification_reactivated_at = now(),
           warnings = (
             SELECT jsonb_agg(DISTINCT w)
               FROM jsonb_array_elements_text(
                 COALESCE(v_row.warnings, '[]'::jsonb) || '["verifikacija_bez_prvog_maila"]'::jsonb
               ) AS w
           ),
           updated_at = now()
     WHERE id = v_row.id;

    INSERT INTO public.notifications (user_id, type, title, message, data, dedup_key)
    VALUES (
      v_row.owner_user_id,
      'mail_document_pending',
      'notifications.mail.pending.title',
      'notifications.mail.pending.body',
      jsonb_build_object(
        'item_id', v_row.id,
        'priority', true,
        'route', '/dokumenti',
        'fallback_route', '/dokumenti',
        'title_vars', '{}'::jsonb,
        'message_vars', '{}'::jsonb
      ),
      'mail_document_pending:' || v_row.id::text
    )
    ON CONFLICT DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.mail_verification_reactivate_stale() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_verification_reactivate_stale() TO service_role;

-- 6) Dnevni cron (postojeći mehanizam, DB funkcija bez mrežnog poziva).
SELECT cron.unschedule('mail-verification-reactivate-daily')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mail-verification-reactivate-daily');

SELECT cron.schedule(
  'mail-verification-reactivate-daily',
  '30 6 * * *',
  $cron$ SELECT public.mail_verification_reactivate_stale(); $cron$
);