-- ============================================================================
-- T4. krug_shared_payment_source
-- ============================================================================

CREATE TABLE public.krug_shared_payment_source (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  krug_id uuid NOT NULL REFERENCES public.krug(id) ON DELETE CASCADE,
  payment_source_id text NOT NULL,
  linked_by uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (krug_id, payment_source_id)
);

CREATE INDEX idx_krug_sps_krug ON public.krug_shared_payment_source(krug_id);
CREATE INDEX idx_krug_sps_source ON public.krug_shared_payment_source(payment_source_id);

GRANT SELECT, INSERT, DELETE ON public.krug_shared_payment_source TO authenticated;
GRANT ALL ON public.krug_shared_payment_source TO service_role;

ALTER TABLE public.krug_shared_payment_source ENABLE ROW LEVEL SECURITY;

-- Helper: vlasnik je ovlašten linkati izvor (custom:UUID → mora biti owner izvora;
-- built-in slug bez prefiksa custom: → dovoljno biti owner kruga).
CREATE OR REPLACE FUNCTION public.krug_can_manage_shared_source(_krug uuid, _user uuid, _source_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uuid_part text;
  _src_uuid uuid;
BEGIN
  IF NOT public.krug_is_owner(_krug, _user) THEN
    RETURN false;
  END IF;

  IF _source_id LIKE 'custom:%' THEN
    _uuid_part := substr(_source_id, 8);
    BEGIN
      _src_uuid := _uuid_part::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    RETURN public.is_payment_source_owner(_src_uuid, _user);
  END IF;

  -- Built-in slug (npr. 'cash', 'bank_account') — owner kruga je dovoljan.
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_can_manage_shared_source(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_can_manage_shared_source(uuid, uuid, text) TO authenticated, service_role;

CREATE POLICY "krug_sps_select_member"
  ON public.krug_shared_payment_source FOR SELECT
  TO authenticated
  USING (public.krug_is_member(krug_id, auth.uid()));

CREATE POLICY "krug_sps_insert_owner_and_source_owner"
  ON public.krug_shared_payment_source FOR INSERT
  TO authenticated
  WITH CHECK (
    linked_by = auth.uid()
    AND public.krug_can_manage_shared_source(krug_id, auth.uid(), payment_source_id)
  );

CREATE POLICY "krug_sps_delete_owner_and_source_owner"
  ON public.krug_shared_payment_source FOR DELETE
  TO authenticated
  USING (
    public.krug_can_manage_shared_source(krug_id, auth.uid(), payment_source_id)
  );

-- ============================================================================
-- T8. krug_act_dedup
-- ============================================================================

CREATE TABLE public.krug_act_dedup (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  expense_id uuid NOT NULL,
  act text NOT NULL,
  client_request_id text NOT NULL,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, expense_id, act, client_request_id)
);

CREATE INDEX idx_krug_dedup_created ON public.krug_act_dedup(created_at);

GRANT SELECT ON public.krug_act_dedup TO authenticated;
GRANT ALL ON public.krug_act_dedup TO service_role;

ALTER TABLE public.krug_act_dedup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "krug_act_dedup_select_self"
  ON public.krug_act_dedup FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Pisanje ide isključivo kroz SECURITY DEFINER RPC-e; bez INSERT/UPDATE/DELETE policy-ja.

-- ============================================================================
-- T8. krug_apply_act — A1 (potvrda), A2 (negacija), A5 (autor → predlozena)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.krug_apply_act(
  p_expense_id uuid,
  p_act text,
  p_client_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _viewer uuid := auth.uid();
  _exp record;
  _prev_status public.krug_shared_status;
  _new_status public.krug_shared_status;
  _outcome text;
  _dedup_hit record;
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

  -- Idempotencija: ako isti (user, expense, act, request_id) postoji u zadnjih 24h, vrati prijašnji ishod.
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
    -- Governance, H1 + H3: punopravni član kruga, NIJE autor.
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
    -- Autor (H5) + punopravni član (H2): vraća potvrdjena/nepotvrdjena → predlozena.
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

  -- Idempotencija na razini stanja: već u ciljnom stanju.
  IF _prev_status = _new_status THEN
    _outcome := 'noop_already_in_target_state';
  ELSE
    UPDATE public.expenses
       SET krug_shared_status = _new_status,
           updated_at = now()
     WHERE id = _exp.id;
  END IF;

  INSERT INTO public.krug_act_dedup(user_id, expense_id, act, client_request_id, outcome)
  VALUES (_viewer, _exp.id, p_act, p_client_request_id, _outcome)
  ON CONFLICT (user_id, expense_id, act, client_request_id) DO NOTHING;

  RETURN jsonb_build_object(
    'outcome', _outcome,
    'expense_id', _exp.id,
    'krug_id', _exp.krug_id,
    'previous_status', _prev_status,
    'new_status', _new_status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_apply_act(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_apply_act(uuid, text, text) TO authenticated, service_role;

-- ============================================================================
-- T8. krug_withdraw — A4 (autor hard-withdraw u predloženom toku)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.krug_withdraw(
  p_expense_id uuid,
  p_client_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _viewer uuid := auth.uid();
  _exp record;
  _outcome text;
  _dedup_hit record;
BEGIN
  IF _viewer IS NULL THEN
    RETURN jsonb_build_object('outcome','unauthenticated');
  END IF;

  IF coalesce(p_client_request_id,'') = '' THEN
    RETURN jsonb_build_object('outcome','missing_client_request_id');
  END IF;

  SELECT outcome INTO _dedup_hit
  FROM public.krug_act_dedup
  WHERE user_id = _viewer
    AND expense_id = p_expense_id
    AND act = 'A4'
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

  SELECT id, user_id, krug_id, krug_privacy, krug_shared_status, deleted_at
    INTO _exp
  FROM public.expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','not_found','expense_id',p_expense_id);
  END IF;

  IF _exp.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('outcome','noop_already_in_target_state','expense_id',_exp.id);
  END IF;

  IF _exp.user_id <> _viewer THEN
    RETURN jsonb_build_object('outcome','not_author','expense_id',_exp.id);
  END IF;

  IF _exp.krug_id IS NULL OR _exp.krug_privacy <> 'shared'::public.krug_privacy THEN
    RETURN jsonb_build_object('outcome','not_in_shared_flow','expense_id',_exp.id);
  END IF;

  IF NOT public.krug_is_full_member(_exp.krug_id, _viewer) THEN
    RETURN jsonb_build_object('outcome','not_full_member','expense_id',_exp.id);
  END IF;

  IF _exp.krug_shared_status <> 'predlozena'::public.krug_shared_status THEN
    RETURN jsonb_build_object(
      'outcome','wrong_state',
      'expense_id',_exp.id,
      'previous_status',_exp.krug_shared_status
    );
  END IF;

  -- Hard withdraw = soft delete kroz postojeći helper, čuva ostale invarijante.
  PERFORM public.soft_delete_record('expenses', _exp.id);
  _outcome := 'ok_withdrawn';

  INSERT INTO public.krug_act_dedup(user_id, expense_id, act, client_request_id, outcome)
  VALUES (_viewer, _exp.id, 'A4', p_client_request_id, _outcome)
  ON CONFLICT (user_id, expense_id, act, client_request_id) DO NOTHING;

  RETURN jsonb_build_object(
    'outcome', _outcome,
    'expense_id', _exp.id,
    'krug_id', _exp.krug_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_withdraw(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_withdraw(uuid, text) TO authenticated, service_role;
