CREATE OR REPLACE FUNCTION public.lookup_import_fingerprints(p_fingerprints text[])
RETURNS TABLE(fingerprint text, is_deleted boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.bank_transaction_id::text,
         bool_and(e.deleted_at IS NOT NULL) AS is_deleted
  FROM public.expenses e
  WHERE e.user_id = auth.uid()
    AND e.bank_transaction_id = ANY(p_fingerprints)
    AND COALESCE(e.status::text, 'approved') = 'approved'
  GROUP BY e.bank_transaction_id
$$;

REVOKE EXECUTE ON FUNCTION public.lookup_import_fingerprints(text[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_import_fingerprints(text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_deleted_import_row(p_fingerprint text, p_batch_id uuid)
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
     AND bank_transaction_id = p_fingerprint
     AND deleted_at IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restore_deleted_import_row(text, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_deleted_import_row(text, uuid) TO authenticated;