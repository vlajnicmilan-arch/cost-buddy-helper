-- Unmerge an auto-merged (confirmed) imported row back into a plain manual entry.
-- Used when deleting an import batch: rows that originally came from a manual
-- entry and got merged with a statement line should NOT be deleted; instead we
-- strip the bank fingerprint and batch id so they revert to the user's manual
-- transaction. Balance stays as it was (manual already affected it).
CREATE OR REPLACE FUNCTION public.unmerge_import_row(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.expenses
     SET bank_transaction_id = NULL,
         bank_match_status   = 'manual',
         import_batch_id     = NULL
   WHERE id                = p_id
     AND user_id           = v_uid
     AND bank_match_status = 'confirmed'
     AND deleted_at IS NULL;
END;
$$;