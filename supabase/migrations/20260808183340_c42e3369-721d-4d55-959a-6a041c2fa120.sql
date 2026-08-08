ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS krug_reject_reason text;

DROP FUNCTION IF EXISTS public.krug_apply_act(uuid, text, text);

CREATE OR REPLACE FUNCTION public.krug_apply_act(
  p_expense_id uuid,
  p_act text,
  p_client_request_id text,
  p_reason text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _viewer uuid := auth.uid();
  _exp record;
  _prev_status public.krug_shared_status;
  _new_status public.krug_shared_status;
  _outcome text;
  _dedup_hit record;
  _dedup_id uuid;
  _reason text;
BEGIN
  IF _viewer IS NULL THEN
    RETURN jsonb_build_object('outcome','unauthenticated');
  END IF;

  IF p_act NOT IN ('A1','A2','A5') THEN
    RETURN jsonb_build_object('outcome','invalid_act','act',p_act);
  END IF;

  IF coalesce(p_client_request_id,'') = '' THEN
    RETURN jsonb_build_object('outcome','missing_client_request_id');
  END IF;

  -- A2 (odbijanje) je poruka drugoj osobi o zajedničkom novcu: razlog je obavezan.
  _reason := nullif(btrim(coalesce(p_reason,'')), '');
  IF p_act = 'A2' AND _reason IS NULL THEN
    RETURN jsonb_build_object('outcome','reason_required','expense_id',p_expense_id);
  END IF;
  IF _reason IS NOT NULL THEN
    _reason := left(_reason, 200);
  END IF;

  SELECT outcome INTO _dedup_hit
  FROM public.krug_act_dedup
  WHERE user_id = _viewer
    AND expense_id = p_expense_id
    AND act = p_act
    AND client_request_id = p_client_request_id
    AND created_at > now() - interval '24 hours'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome', _dedup_hit.outcome,
      'expense_id', p_expense_id,
      'replayed', true
    );
  END IF;

  SELECT id, user_id, krug_id, krug_privacy, krug_shared_status
    INTO _exp
  FROM public.expenses
  WHERE id = p_expense_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','not_found','expense_id',p_expense_id);
  END IF;

  IF _exp.krug_id IS NULL OR _exp.krug_privacy <> 'shared'::public.krug_privacy THEN
    RETURN jsonb_build_object('outcome','not_in_shared_flow','expense_id',_exp.id);
  END IF;

  _prev_status := _exp.krug_shared_status;
  _new_status := _prev_status;

  IF p_act IN ('A1','A2') THEN
    IF _exp.user_id = _viewer THEN
      RETURN jsonb_build_object('outcome','author_cannot_govern','expense_id',_exp.id);
    END IF;
    IF NOT public.krug_is_full_member(_exp.krug_id, _viewer) THEN
      RETURN jsonb_build_object('outcome','not_full_member','expense_id',_exp.id);
    END IF;
    IF _prev_status <> 'predlozena'::public.krug_shared_status THEN
      RETURN jsonb_build_object(
        'outcome','wrong_state',
        'expense_id',_exp.id,
        'previous_status',_prev_status
      );
    END IF;

    IF p_act = 'A1' THEN
      _new_status := 'potvrdjena'::public.krug_shared_status;
      _outcome := 'ok_confirmed';
    ELSE
      _new_status := 'nepotvrdjena'::public.krug_shared_status;
      _outcome := 'ok_negated';
    END IF;

  ELSIF p_act = 'A5' THEN
    IF _exp.user_id <> _viewer THEN
      RETURN jsonb_build_object('outcome','not_author','expense_id',_exp.id);
    END IF;
    IF NOT public.krug_is_full_member(_exp.krug_id, _viewer) THEN
      RETURN jsonb_build_object('outcome','not_full_member','expense_id',_exp.id);
    END IF;
    IF _prev_status NOT IN ('potvrdjena'::public.krug_shared_status,'nepotvrdjena'::public.krug_shared_status) THEN
      RETURN jsonb_build_object(
        'outcome','wrong_state',
        'expense_id',_exp.id,
        'previous_status',_prev_status
      );
    END IF;
    _new_status := 'predlozena'::public.krug_shared_status;
    _outcome := 'ok_reproposed';
  END IF;

  IF _prev_status = _new_status THEN
    _outcome := 'noop_already_in_target_state';
  ELSE
    UPDATE public.expenses
       SET krug_shared_status = _new_status,
           krug_reject_reason = CASE WHEN p_act = 'A2' THEN _reason ELSE NULL END,
           updated_at = now()
     WHERE id = _exp.id;
  END IF;

  INSERT INTO public.krug_act_dedup(user_id, expense_id, act, client_request_id, outcome)
  VALUES (_viewer, _exp.id, p_act, p_client_request_id, _outcome)
  ON CONFLICT (user_id, expense_id, act, client_request_id) DO NOTHING
  RETURNING id INTO _dedup_id;

  IF _dedup_id IS NOT NULL AND _prev_status <> _new_status THEN
    IF p_act = 'A1' THEN
      PERFORM public.krug_emit_notification(
        'krug_expense_confirmed',
        _exp.krug_id,
        _viewer,
        _exp.id,
        NULL,
        'krug_expense_confirmed:act:' || _dedup_id::text,
        ARRAY[_exp.user_id]::uuid[]
      );
    ELSIF p_act = 'A2' THEN
      PERFORM public.krug_emit_notification(
        'krug_expense_rejected',
        _exp.krug_id,
        _viewer,
        _exp.id,
        NULL,
        'krug_expense_rejected:act:' || _dedup_id::text,
        ARRAY[_exp.user_id]::uuid[],
        jsonb_build_object('reason', _reason)
      );
    ELSIF p_act = 'A5' THEN
      PERFORM public.krug_emit_notification(
        'krug_expense_proposed',
        _exp.krug_id,
        _viewer,
        _exp.id,
        NULL,
        'krug_expense_proposed:act:' || _dedup_id::text,
        NULL
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'outcome', _outcome,
    'expense_id', _exp.id,
    'krug_id', _exp.krug_id,
    'previous_status', _prev_status,
    'new_status', _new_status,
    'reason', _reason
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.krug_apply_act(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.krug_apply_act(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.krug_apply_act(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.krug_apply_act(uuid, text, text, text) TO service_role;