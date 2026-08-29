CREATE OR REPLACE FUNCTION public.brief_gate_snapshot_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  allow jsonb;
  v_enabled boolean := false;
  unc_count int := 0;
  unc_wm timestamptz;
  due_count int := 0;
  due_wm timestamptz;
  due_next date;
  due_issuer text;
  mail_count int := 0;
  mail_wm timestamptz;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  SELECT value INTO allow FROM public.app_settings WHERE key = 'brief_gate_user_ids';
  IF allow IS NOT NULL AND jsonb_typeof(allow) = 'array' THEN
    -- '*' u popisu znaci: vrata su otvorena SVIMA. Prazan popis i dalje znaci nikome.
    v_enabled := (allow ? '*') OR (allow ? uid::text);
  END IF;

  IF NOT v_enabled THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  -- NEIZVJESNOST: stavke koje eksplicitno cekaju korisnikovu odluku
  SELECT count(*)::int, max(created_at)
    INTO unc_count, unc_wm
    FROM public.document_ingest_items
   WHERE owner_user_id = uid AND status = 'na_pregledu';

  -- DOSPIJECE: ulazni racuni koji dospijevaju u 7 dana (ukljucuje prekoracene)
  SELECT count(*)::int, max(created_at)
    INTO due_count, due_wm
    FROM public.incoming_invoices
   WHERE user_id = uid
     AND direction = 'in'
     AND paid_at IS NULL
     AND due_date IS NOT NULL
     AND due_date <= CURRENT_DATE + 7;

  SELECT due_date, supplier_name
    INTO due_next, due_issuer
    FROM public.incoming_invoices
   WHERE user_id = uid
     AND direction = 'in'
     AND paid_at IS NULL
     AND due_date IS NOT NULL
     AND due_date <= CURRENT_DATE + 7
   ORDER BY due_date ASC
   LIMIT 1;

  -- MAIL: dokumenti obradjeni iz mail lijevka (zadnjih 7 dana)
  SELECT count(*)::int, max(updated_at)
    INTO mail_count, mail_wm
    FROM public.document_ingest_items
   WHERE owner_user_id = uid
     AND source = 'mail'
     AND status = 'povezan'
     AND updated_at >= now() - interval '7 days';

  RETURN jsonb_build_object(
    'enabled', true,
    'categories', jsonb_build_object(
      'uncertainty', jsonb_build_object(
        'count', unc_count,
        'watermark', unc_wm,
        'filter', jsonb_build_object('path', '/dokumenti', 'tab', 'pending')
      ),
      'due', jsonb_build_object(
        'count', due_count,
        'watermark', due_wm,
        'nextDue', due_next,
        'issuer', due_issuer,
        'filter', jsonb_build_object('path', '/home', 'view', 'overdue')
      ),
      'mail', jsonb_build_object(
        'count', mail_count,
        'watermark', mail_wm,
        'filter', jsonb_build_object('path', '/dokumenti', 'tab', 'received')
      )
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.brief_gate_snapshot_v2() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.brief_gate_snapshot_v2() FROM anon;
GRANT EXECUTE ON FUNCTION public.brief_gate_snapshot_v2() TO authenticated;