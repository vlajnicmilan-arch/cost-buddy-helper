-- T7: krug_set_privacy RPC (Implementation Sprint v1.1 / Transport Plan v1.1)

CREATE OR REPLACE FUNCTION public.krug_set_privacy(
  p_expense_id uuid,
  p_new_privacy public.krug_privacy
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _viewer uuid := auth.uid();
  _exp record;
  _prev_privacy public.krug_privacy;
  _prev_status public.krug_shared_status;
  _new_status public.krug_shared_status := NULL;
  _outcome text;
BEGIN
  IF _viewer IS NULL THEN
    RETURN jsonb_build_object('outcome','unauthenticated');
  END IF;

  -- Lock retka za deterministički ishod (konkurencija).
  SELECT id, user_id, krug_id, krug_privacy, krug_shared_status
    INTO _exp
  FROM public.expenses
  WHERE id = p_expense_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','not_found','expense_id',p_expense_id);
  END IF;

  IF _exp.krug_id IS NULL THEN
    RETURN jsonb_build_object('outcome','not_in_krug_context','expense_id',p_expense_id);
  END IF;

  IF _exp.user_id <> _viewer THEN
    RETURN jsonb_build_object('outcome','not_author','expense_id',p_expense_id);
  END IF;

  _prev_privacy := _exp.krug_privacy;
  _prev_status  := _exp.krug_shared_status;

  -- Idempotencija: već u ciljnom stanju.
  IF _prev_privacy = p_new_privacy
     AND (p_new_privacy <> 'shared'::public.krug_privacy
          OR _prev_status = 'predlozena'::public.krug_shared_status) THEN
    RETURN jsonb_build_object(
      'outcome','noop_already_in_target_state',
      'expense_id',_exp.id,
      'krug_id',_exp.krug_id,
      'previous_privacy',_prev_privacy,
      'new_privacy',_prev_privacy,
      'previous_status',_prev_status,
      'new_status',_prev_status
    );
  END IF;

  -- Dopuštene tranzicije (T7):
  --   personal <-> private  (samo dok krug_shared_status IS NULL)
  --   personal/private -> shared/predlozena  (autor = punopravni član)
  -- Sve ostale tranzicije = wrong_state (npr. iz shared natrag — to je A7, Wave 1.5).

  IF _prev_privacy = 'shared'::public.krug_privacy THEN
    RETURN jsonb_build_object(
      'outcome','wrong_state',
      'expense_id',_exp.id,
      'krug_id',_exp.krug_id,
      'previous_privacy',_prev_privacy,
      'previous_status',_prev_status
    );
  END IF;

  IF p_new_privacy = 'shared'::public.krug_privacy THEN
    IF NOT public.krug_is_full_member(_exp.krug_id, _viewer) THEN
      RETURN jsonb_build_object(
        'outcome','not_full_member',
        'expense_id',_exp.id,
        'krug_id',_exp.krug_id
      );
    END IF;
    _new_status := 'predlozena'::public.krug_shared_status;
    _outcome := 'ok_proposed_shared';

  ELSIF p_new_privacy IN ('personal'::public.krug_privacy, 'private'::public.krug_privacy) THEN
    IF _prev_status IS NOT NULL THEN
      -- Defenzivno; po invarijantama T5 ovo ne bi smjelo biti moguće.
      RETURN jsonb_build_object(
        'outcome','wrong_state',
        'expense_id',_exp.id,
        'krug_id',_exp.krug_id,
        'previous_privacy',_prev_privacy,
        'previous_status',_prev_status
      );
    END IF;
    _outcome := CASE p_new_privacy
      WHEN 'personal'::public.krug_privacy THEN 'ok_set_personal'
      WHEN 'private'::public.krug_privacy  THEN 'ok_set_private'
    END;
  ELSE
    RETURN jsonb_build_object('outcome','invalid_target','expense_id',_exp.id);
  END IF;

  UPDATE public.expenses
     SET krug_privacy = p_new_privacy,
         krug_shared_status = _new_status,
         updated_at = now()
   WHERE id = _exp.id;

  RETURN jsonb_build_object(
    'outcome',_outcome,
    'expense_id',_exp.id,
    'krug_id',_exp.krug_id,
    'previous_privacy',_prev_privacy,
    'new_privacy',p_new_privacy,
    'previous_status',_prev_status,
    'new_status',_new_status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_set_privacy(uuid, public.krug_privacy) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_set_privacy(uuid, public.krug_privacy) TO authenticated, service_role;
