-- Nalog 5 (kategorije): „Pregled kategorija" — potvrda i poništavanje prijedloga.
-- Aditivno: novi stupci u category_corrections, dvije nove SECURITY DEFINER funkcije.
-- Mijenja se SAMO expenses.category / movement_kind / tags. Nikad amount, type,
-- datumi, izvor plaćanja, sidra ni salda.

ALTER TABLE public.category_corrections
  ADD COLUMN IF NOT EXISTS original_movement_kind text NULL,
  ADD COLUMN IF NOT EXISTS corrected_movement_kind text NULL,
  ADD COLUMN IF NOT EXISTS original_tags text[] NULL,
  ADD COLUMN IF NOT EXISTS corrected_tags text[] NULL,
  ADD COLUMN IF NOT EXISTS client_request_id uuid NULL,
  ADD COLUMN IF NOT EXISTS reverted_at timestamptz NULL;

CREATE UNIQUE INDEX IF NOT EXISTS category_corrections_review_request_uniq
  ON public.category_corrections (user_id, client_request_id, expense_id)
  WHERE client_request_id IS NOT NULL;

COMMENT ON COLUMN public.category_corrections.client_request_id IS 'Pregled kategorija: idempotencija potvrde (jedan po potvrdi).';
COMMENT ON COLUMN public.category_corrections.reverted_at IS 'Pregled kategorija: vrijeme poništenja promjene.';

CREATE OR REPLACE FUNCTION public.category_review_apply(_items jsonb, _client_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  c_exempt constant text := 'ab61e917-645c-465c-94f4-aec2645062e9';
  c_leaves constant text[] := ARRAY[
    'coffee','restaurants','delivery','marenda','groceries',
    'fuel','car_service','car_parts','tolls_parking','car_registration',
    'ferry','taxi','lodging','material','tools','workers','contractors',
    'rent','utilities','home_goods','loan_repayment','installments',
    'bank_fees','taxes','clothing','health','care','subscriptions','hobbies',
    'salary','work_income','refunds','other_income'];
  v_item jsonb;
  v_id uuid;
  v_row record;
  v_src uuid;
  v_new_cat text;
  v_new_mk text;
  v_new_tags text[];
  v_changed int := 0;
  v_already int := 0;
  v_unchanged int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF _client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id_required' USING ERRCODE = '22023';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'no_items' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(_items) > 500 THEN
    RAISE EXCEPTION 'too_many_items' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_id := NULLIF(v_item->>'expense_id', '')::uuid;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'invalid_item' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (SELECT 1 FROM public.category_corrections
               WHERE user_id = v_uid AND client_request_id = _client_request_id AND expense_id = v_id) THEN
      v_already := v_already + 1;
      CONTINUE;
    END IF;

    SELECT id, user_id, category, movement_kind, tags, payment_source, description, merchant_name
      INTO v_row
      FROM public.expenses
     WHERE id = v_id AND deleted_at IS NULL
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'expense_not_found' USING ERRCODE = 'P0002';
    END IF;

    v_src := public._extract_custom_source_id(v_row.payment_source);
    IF v_row.user_id IS DISTINCT FROM v_uid
       AND NOT (v_src IS NOT NULL AND public.can_write_payment_source(v_src, v_uid)) THEN
      RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    IF v_row.category = c_exempt THEN
      RAISE EXCEPTION 'exempt_category' USING ERRCODE = '22023';
    END IF;

    v_new_cat := v_row.category;
    IF v_item ? 'category' THEN
      v_new_cat := NULLIF(btrim(v_item->>'category'), '');
      IF v_new_cat IS NULL OR v_new_cat = c_exempt THEN
        RAISE EXCEPTION 'invalid_category' USING ERRCODE = '22023';
      END IF;
      IF NOT (v_new_cat = ANY (c_leaves))
         AND NOT EXISTS (SELECT 1 FROM public.custom_categories
                         WHERE id::text = v_new_cat AND user_id = v_uid) THEN
        RAISE EXCEPTION 'invalid_category' USING ERRCODE = '22023';
      END IF;
    END IF;

    v_new_mk := v_row.movement_kind;
    IF v_item ? 'movement_kind' THEN
      v_new_mk := NULLIF(v_item->>'movement_kind', '');
    END IF;

    v_new_tags := v_row.tags;
    IF v_item ? 'tags' THEN
      IF jsonb_typeof(v_item->'tags') <> 'array' THEN
        RAISE EXCEPTION 'invalid_tags' USING ERRCODE = '22023';
      END IF;
      SELECT COALESCE(array_agg(DISTINCT t ORDER BY t), '{}'::text[])
        INTO v_new_tags
        FROM jsonb_array_elements_text(v_item->'tags') AS t;
    END IF;

    IF v_new_cat IS NOT DISTINCT FROM v_row.category
       AND v_new_mk IS NOT DISTINCT FROM v_row.movement_kind
       AND v_new_tags IS NOT DISTINCT FROM v_row.tags THEN
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;

    UPDATE public.expenses
       SET category = v_new_cat,
           movement_kind = v_new_mk,
           tags = v_new_tags
     WHERE id = v_id;

    INSERT INTO public.category_corrections (
      user_id, expense_id, original_category, original_origin, corrected_category,
      description, merchant_name,
      original_movement_kind, corrected_movement_kind, original_tags, corrected_tags,
      client_request_id)
    VALUES (
      v_uid, v_id, v_row.category, 'category_review', v_new_cat,
      v_row.description, v_row.merchant_name,
      v_row.movement_kind, v_new_mk, v_row.tags, v_new_tags,
      _client_request_id);

    v_changed := v_changed + 1;
  END LOOP;

  RETURN jsonb_build_object('changed', v_changed, 'already', v_already, 'unchanged', v_unchanged);
END;
$function$;

REVOKE ALL ON FUNCTION public.category_review_apply(jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.category_review_apply(jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.category_review_apply(jsonb, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.category_review_revert(_correction_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_c record;
  v_row record;
  v_src uuid;
  v_reverted int := 0;
  v_skipped jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF _correction_ids IS NULL OR cardinality(_correction_ids) = 0 THEN
    RAISE EXCEPTION 'no_items' USING ERRCODE = '22023';
  END IF;
  IF cardinality(_correction_ids) > 500 THEN
    RAISE EXCEPTION 'too_many_items' USING ERRCODE = '22023';
  END IF;

  FOR v_c IN
    SELECT * FROM public.category_corrections
     WHERE id = ANY (_correction_ids)
     ORDER BY created_at DESC
     FOR UPDATE
  LOOP
    IF v_c.user_id IS DISTINCT FROM v_uid OR v_c.original_origin IS DISTINCT FROM 'category_review' THEN
      RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;
    IF v_c.reverted_at IS NOT NULL THEN
      CONTINUE;
    END IF;

    SELECT id, user_id, category, movement_kind, tags, payment_source
      INTO v_row
      FROM public.expenses
     WHERE id = v_c.expense_id AND deleted_at IS NULL
     FOR UPDATE;
    IF NOT FOUND THEN
      v_skipped := v_skipped || jsonb_build_object('id', v_c.id, 'reason', 'expense_not_found');
      CONTINUE;
    END IF;

    v_src := public._extract_custom_source_id(v_row.payment_source);
    IF v_row.user_id IS DISTINCT FROM v_uid
       AND NOT (v_src IS NOT NULL AND public.can_write_payment_source(v_src, v_uid)) THEN
      RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;

    IF v_row.category IS DISTINCT FROM v_c.corrected_category
       OR v_row.movement_kind IS DISTINCT FROM v_c.corrected_movement_kind
       OR v_row.tags IS DISTINCT FROM v_c.corrected_tags THEN
      v_skipped := v_skipped || jsonb_build_object('id', v_c.id, 'reason', 'changed_since');
      CONTINUE;
    END IF;

    UPDATE public.expenses
       SET category = v_c.original_category,
           movement_kind = v_c.original_movement_kind,
           tags = COALESCE(v_c.original_tags, '{}'::text[])
     WHERE id = v_c.expense_id;

    UPDATE public.category_corrections SET reverted_at = now() WHERE id = v_c.id;
    v_reverted := v_reverted + 1;
  END LOOP;

  RETURN jsonb_build_object('reverted', v_reverted, 'skipped', v_skipped);
END;
$function$;

REVOKE ALL ON FUNCTION public.category_review_revert(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.category_review_revert(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.category_review_revert(uuid[]) TO authenticated;