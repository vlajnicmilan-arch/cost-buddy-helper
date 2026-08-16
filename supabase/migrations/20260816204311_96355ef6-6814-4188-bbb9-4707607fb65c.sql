DO $migration$
DECLARE
  v_definition text;
  v_anchor text := E'  IF v_item.id IS NULL THEN RAISE EXCEPTION ''stavka_ne_postoji''; END IF;\n\n  IF v_item.scope_type = ''user'' THEN';
  v_replacement text := E'  IF v_item.id IS NULL THEN RAISE EXCEPTION ''stavka_ne_postoji''; END IF;\n\n  -- Gmailova potvrda prosljeđivanja nije račun i ne smije ni izravnim RPC\n  -- pozivom ući u incoming_invoices.\n  IF v_item.classification = ''verifikacija_prosljedjivanja'' THEN\n    RETURN jsonb_build_object(''ok'', false, ''reason'', ''nije_dokument'');\n  END IF;\n\n  IF v_item.scope_type = ''user'' THEN';
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'mail_item_confirm'
     AND pg_get_function_identity_arguments(p.oid) = 'p_item_id uuid, p_payload jsonb, p_replace_existing_id uuid';

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'mail_item_confirm nije pronađen';
  END IF;

  IF position('v_item.classification = ''verifikacija_prosljedjivanja''' in v_definition) > 0 THEN
    RETURN;
  END IF;

  IF position(v_anchor in v_definition) = 0 THEN
    RAISE EXCEPTION 'Živa definicija mail_item_confirm nema očekivano sidro; migracija zaustavljena';
  END IF;

  v_definition := replace(v_definition, v_anchor, v_replacement);
  EXECUTE v_definition;
END;
$migration$;