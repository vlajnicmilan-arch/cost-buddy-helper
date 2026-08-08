CREATE OR REPLACE FUNCTION public.krug_override_propose(p_expense_id uuid, p_shares jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_krug_id uuid;
  v_full_members uuid[];
  v_expected_users uuid[];
  v_provided_users uuid[];
  v_sum numeric;
  v_id uuid;
  v_full_count int;
  v_recipients uuid[];
  r jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT e.krug_id INTO v_krug_id FROM public.expenses e
   WHERE e.id = p_expense_id AND e.deleted_at IS NULL
     AND e.krug_privacy = 'shared'::public.krug_privacy
     AND e.type = 'expense';
  IF v_krug_id IS NULL THEN
    RAISE EXCEPTION 'expense_not_eligible' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.krug_is_full_member(v_krug_id, v_uid) THEN
    RAISE EXCEPTION 'not_full_member' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(DISTINCT uid ORDER BY uid) INTO v_full_members
  FROM (
    SELECT user_id AS uid FROM public.krug_ownership WHERE krug_id = v_krug_id
    UNION
    SELECT user_id AS uid FROM public.krug_membership
     WHERE krug_id = v_krug_id AND role = 'punopravni'::public.krug_membership_role
  ) s;
  v_full_count := COALESCE(array_length(v_full_members,1),0);

  IF jsonb_typeof(p_shares) <> 'array' THEN
    RAISE EXCEPTION 'shares_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT (x->>'user_id')::uuid ORDER BY (x->>'user_id')::uuid),
         COALESCE(sum((x->>'share_percent')::numeric), 0)
    INTO v_provided_users, v_sum
    FROM jsonb_array_elements(p_shares) x;

  IF v_provided_users IS NULL OR array_length(v_provided_users,1) <> v_full_count THEN
    RAISE EXCEPTION 'shares_must_cover_all_full_members' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_provided_users @> v_full_members AND v_full_members @> v_provided_users) THEN
    RAISE EXCEPTION 'shares_users_mismatch' USING ERRCODE = '22023';
  END IF;
  IF abs(v_sum - 100) > 0.01 THEN
    RAISE EXCEPTION 'shares_sum_not_100' USING ERRCODE = '22023';
  END IF;

  UPDATE public.krug_expense_split_override
     SET status = 'povucena', updated_at = now()
   WHERE expense_id = p_expense_id AND status = 'pending';

  INSERT INTO public.krug_expense_split_override(expense_id, krug_id, proposed_by, status)
  VALUES (p_expense_id, v_krug_id, v_uid, 'pending')
  RETURNING id INTO v_id;

  FOR r IN SELECT * FROM jsonb_array_elements(p_shares) LOOP
    INSERT INTO public.krug_expense_split_share(override_id, user_id, share_percent)
    VALUES (v_id, (r->>'user_id')::uuid, (r->>'share_percent')::numeric);
  END LOOP;

  INSERT INTO public.krug_expense_split_confirmation(override_id, user_id)
  VALUES (v_id, v_uid);

  IF v_full_count = 1 THEN
    UPDATE public.krug_expense_split_override
       SET status = 'povucena', updated_at = now()
     WHERE expense_id = p_expense_id AND status = 'potvrdjena' AND id <> v_id;

    UPDATE public.krug_expense_split_override
       SET status = 'potvrdjena', activated_at = now(), updated_at = now()
     WHERE id = v_id;
  ELSE
    -- Additive best-effort: obavijest NE smije srušiti prijedlog.
    BEGIN
      SELECT array_agg(u) INTO v_recipients
        FROM unnest(v_full_members) u WHERE u <> v_uid;
      IF v_recipients IS NOT NULL AND array_length(v_recipients,1) > 0 THEN
        PERFORM public.krug_emit_notification(
          p_event_type := 'krug_override_proposed',
          p_krug_id := v_krug_id,
          p_actor_id := v_uid,
          p_expense_id := p_expense_id,
          p_dedup_ref := 'override_proposed:'||v_id::text,
          p_recipient_override := v_recipients
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'krug_override_propose: notify failed (id=%): %', v_id, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id,
    'auto_activated', v_full_count = 1,
    'awaiting_confirmations', GREATEST(v_full_count - 1, 0));
END $function$;

CREATE OR REPLACE FUNCTION public.krug_override_confirm(p_override_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.krug_expense_split_override%ROWTYPE;
  v_full_count int;
  v_confirm_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_row FROM public.krug_expense_split_override
   WHERE id = p_override_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;

  IF NOT public.krug_is_full_member(v_row.krug_id, v_uid) THEN
    RAISE EXCEPTION 'not_full_member' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'not_pending' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.krug_expense_split_confirmation(override_id, user_id)
  VALUES (p_override_id, v_uid)
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO v_full_count FROM (
    SELECT user_id FROM public.krug_ownership WHERE krug_id = v_row.krug_id
    UNION
    SELECT user_id FROM public.krug_membership
     WHERE krug_id = v_row.krug_id AND role = 'punopravni'::public.krug_membership_role
  ) s;

  SELECT count(*) INTO v_confirm_count FROM public.krug_expense_split_confirmation
   WHERE override_id = p_override_id;

  IF v_confirm_count >= v_full_count THEN
    UPDATE public.krug_expense_split_override
       SET status = 'povucena', updated_at = now()
     WHERE expense_id = v_row.expense_id AND status = 'potvrdjena' AND id <> p_override_id;

    UPDATE public.krug_expense_split_override
       SET status = 'potvrdjena', activated_at = now(), updated_at = now()
     WHERE id = p_override_id;

    BEGIN
      IF v_row.proposed_by IS NOT NULL AND v_row.proposed_by <> v_uid THEN
        PERFORM public.krug_emit_notification(
          p_event_type := 'krug_override_confirmed',
          p_krug_id := v_row.krug_id,
          p_actor_id := v_uid,
          p_expense_id := v_row.expense_id,
          p_dedup_ref := 'override_confirmed:'||p_override_id::text,
          p_recipient_override := ARRAY[v_row.proposed_by]
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'krug_override_confirm: notify failed (id=%): %', p_override_id, SQLERRM;
    END;

    RETURN jsonb_build_object('ok', true, 'activated', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'activated', false,
    'awaiting_confirmations', v_full_count - v_confirm_count);
END $function$;

CREATE OR REPLACE FUNCTION public.krug_override_reject(p_override_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.krug_expense_split_override%ROWTYPE;
  v_reason text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_row FROM public.krug_expense_split_override
   WHERE id = p_override_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.krug_is_full_member(v_row.krug_id, v_uid) THEN
    RAISE EXCEPTION 'not_full_member' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'not_pending' USING ERRCODE = '22023';
  END IF;
  IF v_row.proposed_by = v_uid THEN
    RAISE EXCEPTION 'proposer_cannot_reject' USING ERRCODE = '42501';
  END IF;

  v_reason := NULLIF(trim(coalesce(p_reason,'')),'');

  UPDATE public.krug_expense_split_override
     SET status = 'odbijena', reject_reason = v_reason, updated_at = now()
   WHERE id = p_override_id;

  BEGIN
    PERFORM public.krug_emit_notification(
      p_event_type := 'krug_override_rejected',
      p_krug_id := v_row.krug_id,
      p_actor_id := v_uid,
      p_expense_id := v_row.expense_id,
      p_dedup_ref := 'override_rejected:'||p_override_id::text,
      p_recipient_override := ARRAY[v_row.proposed_by],
      p_vars := jsonb_build_object('reason', COALESCE(v_reason, '—'))
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'krug_override_reject: notify failed (id=%): %', p_override_id, SQLERRM;
  END;

  RETURN jsonb_build_object('ok', true);
END $function$;