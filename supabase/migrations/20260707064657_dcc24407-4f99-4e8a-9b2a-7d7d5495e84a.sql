-- PR2 Phase A: atomarni SET sidra kroz set_source_anchor RPC.
--
-- BUG 2 remediation: direktan UPDATE anchor kolona bez recomputea ostavlja
-- stored balance nekonzistentnim dok ne stigne sljedeći write. Ova funkcija
-- radi anchor + (opcionalni) audit correction row + recompute u istoj
-- transakciji, tako da je stored balance ISPRAVAN odmah po povratku.
--
-- Phase B (2-3 dana kasnije) dodaje _prevent_direct_anchor_update guard
-- trigger koji blokira direktne UPDATE-ove anchor kolona izvan ove RPC.
-- Zato ova migracija VEĆ postavlja `app.allow_anchor_write` flag — guard
-- će ga čitati bez potrebe za promjenom RPC-a.

CREATE OR REPLACE FUNCTION public.set_source_anchor(
  p_source_id      uuid,
  p_anchor_ts      timestamptz,
  p_anchor_balance numeric,
  p_correction     jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_owner        uuid;
  v_correction_id uuid;
  v_balance_after numeric(12,2);
  v_type         text;
  v_amount       numeric(12,2);
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'set_source_anchor: unauthenticated'
      USING ERRCODE = '42501';
  END IF;

  -- Ownership check with row lock (SECURITY DEFINER bypasses RLS by design).
  SELECT user_id
    INTO v_owner
    FROM public.custom_payment_sources
    WHERE id = p_source_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_source_anchor: source % not found', p_source_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_owner <> v_caller THEN
    RAISE EXCEPTION 'set_source_anchor: not owner'
      USING ERRCODE = '42501';
  END IF;

  -- Flag that Phase B guard trigger will read to allow the write.
  -- Harmless in Phase A (nothing reads it yet).
  PERFORM set_config('app.allow_anchor_write', 'on', true);

  -- (1) Atomarni SET sidra: anchor kolone + balance u jednom UPDATE-u.
  UPDATE public.custom_payment_sources
     SET correction_anchor_date    = p_anchor_ts,
         correction_anchor_balance = p_anchor_balance,
         balance                   = p_anchor_balance,
         updated_at                = now()
   WHERE id = p_source_id;

  -- (2) Opcionalni audit correction red — isti timestamp kao anchor, C1.
  --     expense_nature='correction' → uvijek isključen iz post-anchor sume.
  IF p_correction IS NOT NULL
     AND (p_correction ? 'amount')
     AND (p_correction->>'amount')::numeric <> 0
  THEN
    v_amount := (p_correction->>'amount')::numeric;
    v_type   := COALESCE(
                  p_correction->>'type',
                  CASE WHEN v_amount >= 0 THEN 'income' ELSE 'expense' END
                );
    v_correction_id := gen_random_uuid();

    INSERT INTO public.expenses (
      id, user_id, type, amount, payment_source,
      date, event_at, time_confidence, user_edited_event_at,
      expense_nature, description, category, note
    ) VALUES (
      v_correction_id,
      v_caller,
      v_type,
      abs(v_amount),
      'custom:' || p_source_id::text,
      p_anchor_ts,
      p_anchor_ts,
      'C1',
      false,
      'correction',
      COALESCE(p_correction->>'description', 'Korekcija salda'),
      COALESCE(p_correction->>'category', 'other'),
      p_correction->>'note'
    );
  END IF;

  -- (3) Eksplicitni recompute — idempotentan, verificira invariant i
  --     pokriva slučaj kad correction nije umetnut (trigger tada ne fira).
  PERFORM public.recompute_custom_source_balance(p_source_id);

  SELECT balance INTO v_balance_after
    FROM public.custom_payment_sources
    WHERE id = p_source_id;

  RETURN jsonb_build_object(
    'source_id',      p_source_id,
    'anchor_ts',      p_anchor_ts,
    'anchor_balance', p_anchor_balance,
    'correction_id',  v_correction_id,
    'balance_after',  v_balance_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_source_anchor(uuid, timestamptz, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_source_anchor(uuid, timestamptz, numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_source_anchor(uuid, timestamptz, numeric, jsonb) TO service_role;