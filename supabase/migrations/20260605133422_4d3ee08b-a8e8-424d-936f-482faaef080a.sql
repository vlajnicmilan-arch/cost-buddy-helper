CREATE OR REPLACE FUNCTION public.complete_onboarding(
  p_display_name text,
  p_usage_profile text,
  p_income numeric,
  p_budget_name text,
  p_categories jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_budget_id uuid;
  v_total numeric := 0;
  v_cat_count int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- 1) Profile upsert
  INSERT INTO public.profiles (user_id, display_name, onboarding_completed, updated_at)
  VALUES (v_uid, NULLIF(btrim(COALESCE(p_display_name,'')), ''), true, now())
  ON CONFLICT (user_id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
        onboarding_completed = true,
        updated_at = now();

  -- 2) Budget + categories (samo ako ima prihoda > 0 i barem jedna kategorija)
  IF p_income IS NOT NULL AND p_income > 0
     AND p_categories IS NOT NULL
     AND jsonb_typeof(p_categories) = 'array'
     AND jsonb_array_length(p_categories) > 0 THEN

    SELECT COALESCE(SUM((c->>'limit_amount')::numeric), 0), COUNT(*)
      INTO v_total, v_cat_count
      FROM jsonb_array_elements(p_categories) c;

    IF v_cat_count > 0 AND v_total > 0 THEN
      INSERT INTO public.budget_plans (
        user_id, name, period_type, is_active, is_recurring, total_amount, icon, color
      ) VALUES (
        v_uid,
        COALESCE(NULLIF(btrim(p_budget_name), ''), 'Mjesečni budžet'),
        'monthly', true, true, v_total, '💰', 'hsl(172 66% 40%)'
      )
      RETURNING id INTO v_budget_id;

      INSERT INTO public.budget_categories (budget_id, category, limit_amount, icon, color)
      SELECT
        v_budget_id,
        c->>'category',
        (c->>'limit_amount')::numeric,
        c->>'icon',
        c->>'color'
      FROM jsonb_array_elements(p_categories) c;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'budget_id', v_budget_id,
    'usage_profile', p_usage_profile
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_onboarding(text, text, numeric, text, jsonb) TO authenticated;