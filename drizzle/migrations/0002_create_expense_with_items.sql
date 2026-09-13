CREATE OR REPLACE FUNCTION public.create_expense_with_items(p_expense jsonb, p_items jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid := nullif(p_expense->>'id', '')::uuid;
  v_cols text;
  v_row public.expenses;
  v_existing jsonb;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'create_expense_with_items: p_expense.id (uuid) is required';
  END IF;

  -- Idempotencija: isti id = isti pokušaj spremanja. Ponovni pokušaj nakon
  -- izgubljenog odgovora vraća postojeći redak umjesto da stvara duplikat.
  SELECT to_jsonb(e) INTO v_existing FROM public.expenses e WHERE e.id = v_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT string_agg(quote_ident(k.key), ', ')
    INTO v_cols
    FROM jsonb_object_keys(p_expense) AS k(key)
   WHERE EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'expenses'
        AND c.column_name = k.key
   );

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'create_expense_with_items: no known expenses columns supplied';
  END IF;

  BEGIN
    EXECUTE format(
      'INSERT INTO public.expenses (%1$s) SELECT %1$s FROM jsonb_populate_record(null::public.expenses, $1) RETURNING *',
      v_cols
    ) USING p_expense INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    SELECT to_jsonb(e) INTO v_existing FROM public.expenses e WHERE e.id = v_id;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
    RAISE;
  END;

  IF p_items IS NOT NULL
     AND jsonb_typeof(p_items) = 'array'
     AND jsonb_array_length(p_items) > 0 THEN
    INSERT INTO public.receipt_items (expense_id, name, quantity, unit_price, total_price)
    SELECT v_row.id,
           coalesce(nullif(i->>'name', ''), '-'),
           coalesce(nullif(i->>'quantity', '')::numeric, 1),
           nullif(i->>'unit_price', '')::numeric,
           coalesce(nullif(i->>'total_price', '')::numeric, 0)
      FROM jsonb_array_elements(p_items) AS i;
  END IF;

  RETURN to_jsonb(v_row);
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_expense_with_items(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_expense_with_items(jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_expense_with_items(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_expense_with_items(jsonb, jsonb) TO service_role;