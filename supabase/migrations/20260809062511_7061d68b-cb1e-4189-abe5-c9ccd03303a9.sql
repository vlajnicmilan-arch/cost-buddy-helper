-- 1) Helper: postoji li vlasnik Kruga (SECURITY DEFINER — RLS na krug_ownership
--    ne smije lažno prikazati "nema vlasnika").
CREATE OR REPLACE FUNCTION public.krug_has_owner(_krug uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.krug_ownership WHERE krug_id = _krug);
$$;

REVOKE ALL ON FUNCTION public.krug_has_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_has_owner(uuid) TO authenticated, service_role;

-- 2) created_by rupica: bivši vlasnik/kreator koji je izašao NE smije vidjeti
--    krug redak. created_by grana vrijedi samo u trenutku bootstrapa
--    (INSERT ... RETURNING se provjerava PRIJE nego AFTER trigger stvori
--    ownership/membership), tj. dok Krug još nema vlasnika.
DROP POLICY IF EXISTS krug_select_member ON public.krug;
CREATE POLICY krug_select_member ON public.krug
FOR SELECT
USING (
  public.krug_is_member(id, auth.uid())
  OR public.krug_is_owner(id, auth.uid())
  OR (created_by = auth.uid() AND NOT public.krug_has_owner(id))
);

-- 3) Vlasnikov izlazak uz prijenos vlasništva.
CREATE OR REPLACE FUNCTION public.krug_owner_leave(p_krug_id uuid, p_successor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_krug krug%ROWTYPE;
  v_owner_membership krug_membership%ROWTYPE;
  v_succ krug_membership%ROWTYPE;
  v_full_count int;
  v_others uuid[];
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('outcome','unauthorized');
  END IF;

  SELECT * INTO v_krug FROM public.krug WHERE id = p_krug_id FOR UPDATE;
  IF NOT FOUND OR v_krug.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('outcome','krug_not_found');
  END IF;

  IF NOT public.krug_is_owner(p_krug_id, v_user) THEN
    -- Idempotentno: ponovljeni poziv nakon uspješnog izlaska (nema ni članstva).
    IF NOT EXISTS (
      SELECT 1 FROM public.krug_membership
       WHERE krug_id = p_krug_id AND user_id = v_user
    ) THEN
      RETURN jsonb_build_object('outcome','noop_not_owner');
    END IF;
    RETURN jsonb_build_object('outcome','not_owner');
  END IF;

  -- Ima li uopće nasljednika? (punopravni članovi osim pozivatelja)
  SELECT count(*) INTO v_full_count
    FROM public.krug_membership
   WHERE krug_id = p_krug_id
     AND user_id <> v_user
     AND role = 'punopravni'::public.krug_membership_role;

  IF v_full_count = 0 THEN
    -- Arhiviranje Kruga je zasebna isporuka; ovdje nema polovičnog izlaska.
    RETURN jsonb_build_object('outcome','no_successor_available');
  END IF;

  IF p_successor_id IS NULL OR p_successor_id = v_user THEN
    RETURN jsonb_build_object('outcome','successor_invalid');
  END IF;

  SELECT * INTO v_succ
    FROM public.krug_membership
   WHERE krug_id = p_krug_id AND user_id = p_successor_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','successor_gone');
  END IF;

  IF v_succ.role <> 'punopravni'::public.krug_membership_role THEN
    RETURN jsonb_build_object('outcome','successor_not_full_member');
  END IF;

  -- (1) Vlasništvo — UPDATE, nikad INSERT (unique po krugu).
  UPDATE public.krug_ownership
     SET user_id = p_successor_id
   WHERE krug_id = p_krug_id;

  -- (2) Audit prijenosa.
  INSERT INTO public.krug_membership_audit(krug_id, user_id, actor_id, event, role_at_event, metadata)
  VALUES (
    p_krug_id, p_successor_id, v_user, 'ownership_transferred',
    v_succ.role::text,
    jsonb_build_object('successor_id', p_successor_id, 'previous_owner_id', v_user)
  );

  -- (3) Stari vlasnik izlazi. Ledger, splitovi i osobni troškovi ostaju netaknuti.
  SELECT * INTO v_owner_membership
    FROM public.krug_membership
   WHERE krug_id = p_krug_id AND user_id = v_user
   FOR UPDATE;

  IF FOUND THEN
    DELETE FROM public.krug_membership WHERE id = v_owner_membership.id;
  END IF;

  -- (4) Audit izlaska.
  INSERT INTO public.krug_membership_audit(krug_id, user_id, actor_id, event, role_at_event, metadata)
  VALUES (
    p_krug_id, v_user, v_user, 'owner_left',
    COALESCE(v_owner_membership.role::text, 'owner'),
    jsonb_build_object('successor_id', p_successor_id)
  );

  -- Obavijesti (best effort, dedup po krugu + starom vlasniku).
  PERFORM public.krug_emit_notification(
    'krug_ownership_received',
    p_krug_id,
    v_user,
    NULL,
    NULL,
    'krug_ownership_received:' || p_krug_id::text || ':' || p_successor_id::text,
    ARRAY[p_successor_id],
    NULL
  );

  SELECT COALESCE(array_agg(user_id), ARRAY[]::uuid[]) INTO v_others
    FROM public.krug_membership
   WHERE krug_id = p_krug_id
     AND user_id <> p_successor_id
     AND user_id <> v_user;

  IF array_length(v_others, 1) > 0 THEN
    PERFORM public.krug_emit_notification(
      'krug_owner_left',
      p_krug_id,
      v_user,
      NULL,
      NULL,
      'krug_owner_left:' || p_krug_id::text || ':' || v_user::text,
      v_others,
      NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'outcome','ok_transferred',
    'krug_id', p_krug_id,
    'successor_id', p_successor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.krug_owner_leave(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_owner_leave(uuid, uuid) TO authenticated;
