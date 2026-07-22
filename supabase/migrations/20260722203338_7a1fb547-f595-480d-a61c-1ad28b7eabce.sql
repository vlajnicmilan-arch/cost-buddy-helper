-- 1) Extend funnel_events allowed event names with 'import_undone'.
ALTER TABLE public.funnel_events DROP CONSTRAINT IF EXISTS funnel_events_name_check;
ALTER TABLE public.funnel_events ADD CONSTRAINT funnel_events_name_check CHECK (
  event_name = ANY (ARRAY[
    'install','signup','onboarding_complete','first_transaction','day7_active','paid_conversion',
    'manual_merge_used','onboarding_started','onboarding_step_viewed','onboarding_step_completed',
    'onboarding_step_skipped','onboarding_abandoned','checklist_viewed','checklist_step_clicked',
    'checklist_dismissed','checklist_completed','import_undone'
  ])
);

-- 2) undo_import_batch RPC
CREATE OR REPLACE FUNCTION public.undo_import_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row_owner uuid;
  v_deleted int := 0;
  v_unmerged int := 0;
  v_transfers int := 0;
  v_freed_fp boolean := false;
  v_owned_count int;
  v_had_bank_anchor boolean := false;
  v_source_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'batch_id_required';
  END IF;

  -- Ownership check: if the batch has any live row, ALL live rows must belong to caller.
  SELECT COUNT(*) INTO v_owned_count
    FROM public.expenses
   WHERE import_batch_id = p_batch_id
     AND deleted_at IS NULL;

  IF v_owned_count > 0 THEN
    SELECT DISTINCT user_id INTO v_row_owner
      FROM public.expenses
     WHERE import_batch_id = p_batch_id
       AND deleted_at IS NULL
     LIMIT 2;
    -- If multiple owners, or owner != caller → deny.
    IF v_row_owner IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'not_authorized_for_batch';
    END IF;
    -- Extra defense: no foreign rows in batch.
    IF EXISTS (
      SELECT 1 FROM public.expenses
       WHERE import_batch_id = p_batch_id
         AND deleted_at IS NULL
         AND user_id <> v_uid
    ) THEN
      RAISE EXCEPTION 'not_authorized_for_batch';
    END IF;
  END IF;

  -- Collect source IDs and detect if any post-batch anchor is bank_reconciliation
  -- (informational only — Option A: never auto-revert).
  SELECT array_agg(DISTINCT substr(payment_source, 8)::uuid)
    INTO v_source_ids
    FROM public.expenses
   WHERE import_batch_id = p_batch_id
     AND deleted_at IS NULL
     AND payment_source LIKE 'custom:%';

  IF v_source_ids IS NOT NULL THEN
    SELECT bool_or(anchor_source = 'bank_reconciliation')
      INTO v_had_bank_anchor
      FROM public.custom_payment_sources
     WHERE id = ANY(v_source_ids)
       AND user_id = v_uid;
  END IF;

  -- 2a) UNMERGE confirmed rows: preserve ALL user-edited fields.
  WITH upd AS (
    UPDATE public.expenses
       SET bank_transaction_id = NULL,
           bank_match_status   = 'manual',
           import_batch_id     = NULL
     WHERE import_batch_id = p_batch_id
       AND user_id         = v_uid
       AND bank_match_status = 'confirmed'
       AND deleted_at IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO v_unmerged FROM upd;

  -- 2b) HARD DELETE bank_only rows (both plain inserts and transfers).
  WITH del_t AS (
    DELETE FROM public.expenses
     WHERE import_batch_id = p_batch_id
       AND user_id         = v_uid
       AND deleted_at IS NULL
       AND bank_match_status = 'bank_only'
       AND type = 'transfer'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_transfers FROM del_t;

  WITH del_r AS (
    DELETE FROM public.expenses
     WHERE import_batch_id = p_batch_id
       AND user_id         = v_uid
       AND deleted_at IS NULL
       AND bank_match_status = 'bank_only'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM del_r;

  -- 2c) Delete imported_statements row(s) for this batch → frees fingerprint.
  WITH del_is AS (
    DELETE FROM public.imported_statements
     WHERE import_batch_id = p_batch_id
       AND user_id = v_uid
    RETURNING id
  )
  SELECT COUNT(*) > 0 INTO v_freed_fp FROM del_is;

  -- Idempotency: no work done and nothing to free → already undone.
  IF v_unmerged = 0 AND v_deleted = 0 AND v_transfers = 0 AND NOT v_freed_fp THEN
    RETURN jsonb_build_object(
      'already_undone', true,
      'deleted', 0,
      'unmerged', 0,
      'transfers', 0,
      'freed_fingerprint', false
    );
  END IF;

  -- 2d) Telemetry (best-effort — swallow errors, never block undo).
  BEGIN
    INSERT INTO public.funnel_events (user_id, event_name, metadata)
    VALUES (
      v_uid,
      'import_undone',
      jsonb_build_object(
        'batch_id', p_batch_id,
        'deleted', v_deleted,
        'unmerged', v_unmerged,
        'transfers', v_transfers,
        'freed_fingerprint', v_freed_fp,
        'had_bank_anchor', COALESCE(v_had_bank_anchor, false),
        'source_ids', COALESCE(to_jsonb(v_source_ids), '[]'::jsonb)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- ignore
    NULL;
  END;

  RETURN jsonb_build_object(
    'already_undone', false,
    'deleted', v_deleted,
    'unmerged', v_unmerged,
    'transfers', v_transfers,
    'freed_fingerprint', v_freed_fp,
    'had_bank_anchor', COALESCE(v_had_bank_anchor, false)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.undo_import_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_import_batch(uuid) TO authenticated;

COMMENT ON FUNCTION public.undo_import_batch(uuid) IS
  'Undo an entire import batch atomically. Unmerges confirmed rows (preserves user edits), hard-deletes bank_only rows and transfers, deletes the imported_statements row to free the fingerprint. Anchor columns and anchor_audit are never touched (Option A). Idempotent: second call returns already_undone=true.';