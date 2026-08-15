CREATE OR REPLACE FUNCTION public.brief_gate_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  allow jsonb;
  v_enabled boolean := false;
  inv_count int := 0;
  inv_next date := NULL;
  doc_count int := 0;
  att_count int := 0;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  SELECT value INTO allow FROM public.app_settings WHERE key = 'brief_gate_user_ids';
  IF allow IS NOT NULL AND jsonb_typeof(allow) = 'array' THEN
    v_enabled := allow ? uid::text;
  END IF;

  IF NOT v_enabled THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  SELECT count(*)::int, min(due_date)
    INTO inv_count, inv_next
    FROM public.incoming_invoices
   WHERE user_id = uid
     AND direction = 'in'
     AND paid_at IS NULL
     AND due_date IS NOT NULL
     AND due_date <= CURRENT_DATE;

  SELECT count(*)::int INTO doc_count
    FROM public.document_ingest_items
   WHERE owner_user_id = uid AND status = 'na_pregledu';

  SELECT count(*)::int INTO att_count
    FROM public.notifications
   WHERE user_id = uid AND status = 'active' AND type <> 'mail_document_pending';

  RETURN jsonb_build_object(
    'enabled', true,
    'invoices', jsonb_build_object('count', inv_count, 'nextDue', inv_next),
    'documents', jsonb_build_object('count', doc_count),
    'attention', jsonb_build_object('count', att_count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.brief_gate_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.brief_gate_snapshot() FROM anon;
GRANT EXECUTE ON FUNCTION public.brief_gate_snapshot() TO authenticated;