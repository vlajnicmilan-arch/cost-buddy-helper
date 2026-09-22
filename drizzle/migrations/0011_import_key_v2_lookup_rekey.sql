-- KORAK 1 PROGRAMA TEMELJ — prijelaz na ključ uvoza v2 (`imp2:`).
-- Dvije postojeće funkcije moraju raditi s POPISOM ključeva (v1 + v2), inače
-- se gubi veza sa soft-obrisanim retcima; treća funkcija prepisuje stari ključ
-- na novi (rekey) i za obrisane retke, koje RLS skriva od klijenta.

-- 1) Povrat obrisanog retka po BILO KOJEM od poznatih ključeva.
CREATE OR REPLACE FUNCTION public.restore_deleted_import_row(p_fingerprints text[], p_batch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.expenses
     SET deleted_at = NULL,
         deleted_by = NULL,
         import_batch_id = COALESCE(p_batch_id, import_batch_id),
         updated_at = now()
   WHERE user_id = auth.uid()
     AND bank_transaction_id = ANY(p_fingerprints)
     AND deleted_at IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_deleted_import_row(text[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_deleted_import_row(text[], uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_deleted_import_row(text[], uuid) TO authenticated;

-- 2) REKEY — stari ključ (`imp:`) na retku se zamjenjuje novim (`imp2:`).
--    Radi i za soft-obrisane retke; nikad ne stvara novi redak i nikad ne
--    prepisuje preko ključa koji već postoji na drugom retku.
CREATE OR REPLACE FUNCTION public.rekey_import_fingerprints(p_pairs jsonb)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pair jsonb;
  v_old text;
  v_new text;
  v_total integer := 0;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_pairs IS NULL OR jsonb_typeof(p_pairs) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR v_pair IN SELECT * FROM jsonb_array_elements(p_pairs)
  LOOP
    v_old := v_pair ->> 'old';
    v_new := v_pair ->> 'new';
    CONTINUE WHEN v_old IS NULL OR v_new IS NULL OR v_old = v_new;

    UPDATE public.expenses e
       SET bank_transaction_id = v_new,
           updated_at = now()
     WHERE e.user_id = auth.uid()
       AND e.bank_transaction_id = v_old
       AND NOT EXISTS (
         SELECT 1 FROM public.expenses x
          WHERE x.user_id = auth.uid()
            AND x.bank_transaction_id = v_new
       );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.rekey_import_fingerprints(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rekey_import_fingerprints(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.rekey_import_fingerprints(jsonb) TO authenticated;

COMMENT ON FUNCTION public.restore_deleted_import_row(text, uuid)
  IS 'DEPRECATED: zamijenjena inačicom s popisom ključeva restore_deleted_import_row(text[], uuid).';