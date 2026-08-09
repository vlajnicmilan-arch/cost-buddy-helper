-- =========================================================================
-- KRUG 2/2: arhiva samo za čitanje
-- Aditivno: nova funkcija-brana + BEFORE okidači + arhivski put u owner_leave.
-- Ništa se ne DROP-a osim vlastitih okidača (idempotencija).
-- =========================================================================

-- 1) Brana -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.krug_assert_writable(_krug uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _krug IS NULL THEN
    RETURN;
  END IF;
  -- Bypass: postavlja ga isključivo BEFORE DELETE okidač na `krug`
  -- (kaskadno brisanje cijele arhive) — transakcijski lokalno.
  IF COALESCE(current_setting('krug.bypass_barrier', true), '') = 'on' THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.krug
     WHERE id = _krug
       AND lifecycle_state = 'read_only'::public.krug_lifecycle_state
       AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'krug_archived_read_only'
      USING ERRCODE = '42501',
            DETAIL = 'krug_id=' || _krug::text,
            HINT = 'Arhivirani Krug je samo za čitanje.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.krug_assert_writable(uuid) FROM PUBLIC, anon;

-- 2) Generički okidači ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.krug_barrier_by_krug_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.krug_assert_writable(OLD.krug_id);
    RETURN OLD;
  END IF;
  PERFORM public.krug_assert_writable(NEW.krug_id);
  IF TG_OP = 'UPDATE' THEN
    PERFORM public.krug_assert_writable(OLD.krug_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.krug_barrier_by_override_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_krug uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT krug_id INTO v_krug FROM public.krug_expense_split_override WHERE id = OLD.override_id;
    PERFORM public.krug_assert_writable(v_krug);
    RETURN OLD;
  END IF;
  SELECT krug_id INTO v_krug FROM public.krug_expense_split_override WHERE id = NEW.override_id;
  PERFORM public.krug_assert_writable(v_krug);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.krug_barrier_by_krug_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.krug_barrier_by_override_id() FROM PUBLIC, anon;

-- 3) Okidači na tablicama sadržaja -----------------------------------------
DROP TRIGGER IF EXISTS krug_archive_barrier ON public.expenses;
CREATE TRIGGER krug_archive_barrier
  BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.krug_barrier_by_krug_id();

DROP TRIGGER IF EXISTS krug_archive_barrier ON public.krug_membership;
CREATE TRIGGER krug_archive_barrier
  BEFORE INSERT OR UPDATE OR DELETE ON public.krug_membership
  FOR EACH ROW EXECUTE FUNCTION public.krug_barrier_by_krug_id();

DROP TRIGGER IF EXISTS krug_archive_barrier ON public.krug_invitations;
CREATE TRIGGER krug_archive_barrier
  BEFORE INSERT OR UPDATE OR DELETE ON public.krug_invitations
  FOR EACH ROW EXECUTE FUNCTION public.krug_barrier_by_krug_id();

DROP TRIGGER IF EXISTS krug_archive_barrier ON public.krug_expense_split_override;
CREATE TRIGGER krug_archive_barrier
  BEFORE INSERT OR UPDATE OR DELETE ON public.krug_expense_split_override
  FOR EACH ROW EXECUTE FUNCTION public.krug_barrier_by_krug_id();

DROP TRIGGER IF EXISTS krug_archive_barrier ON public.krug_income_ratio;
CREATE TRIGGER krug_archive_barrier
  BEFORE INSERT OR UPDATE OR DELETE ON public.krug_income_ratio
  FOR EACH ROW EXECUTE FUNCTION public.krug_barrier_by_krug_id();

DROP TRIGGER IF EXISTS krug_archive_barrier ON public.krug_settlement_ledger;
CREATE TRIGGER krug_archive_barrier
  BEFORE INSERT OR UPDATE OR DELETE ON public.krug_settlement_ledger
  FOR EACH ROW EXECUTE FUNCTION public.krug_barrier_by_krug_id();

DROP TRIGGER IF EXISTS krug_archive_barrier ON public.krug_settlement_fx_snapshot;
CREATE TRIGGER krug_archive_barrier
  BEFORE INSERT OR UPDATE OR DELETE ON public.krug_settlement_fx_snapshot
  FOR EACH ROW EXECUTE FUNCTION public.krug_barrier_by_krug_id();

DROP TRIGGER IF EXISTS krug_archive_barrier ON public.krug_shared_payment_source;
CREATE TRIGGER krug_archive_barrier
  BEFORE INSERT OR UPDATE OR DELETE ON public.krug_shared_payment_source
  FOR EACH ROW EXECUTE FUNCTION public.krug_barrier_by_krug_id();

DROP TRIGGER IF EXISTS krug_archive_barrier ON public.krug_ownership;
CREATE TRIGGER krug_archive_barrier
  BEFORE INSERT OR UPDATE OR DELETE ON public.krug_ownership
  FOR EACH ROW EXECUTE FUNCTION public.krug_barrier_by_krug_id();

DROP TRIGGER IF EXISTS krug_archive_barrier ON public.krug_expense_split_share;
CREATE TRIGGER krug_archive_barrier
  BEFORE INSERT OR UPDATE OR DELETE ON public.krug_expense_split_share
  FOR EACH ROW EXECUTE FUNCTION public.krug_barrier_by_override_id();

DROP TRIGGER IF EXISTS krug_archive_barrier ON public.krug_expense_split_confirmation;
CREATE TRIGGER krug_archive_barrier
  BEFORE INSERT OR UPDATE OR DELETE ON public.krug_expense_split_confirmation
  FOR EACH ROW EXECUTE FUNCTION public.krug_barrier_by_override_id();

-- 4) Sam Krug: whitelist stupaca + bypass za brisanje arhive ---------------
CREATE OR REPLACE FUNCTION public.krug_barrier_self()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Brisanje cijele arhive je dopušteno; kaskade prema djeci moraju proći.
    PERFORM set_config('krug.bypass_barrier', 'on', true);
    RETURN OLD;
  END IF;

  IF OLD.lifecycle_state = 'read_only'::public.krug_lifecycle_state
     AND OLD.deleted_at IS NULL
     AND COALESCE(current_setting('krug.bypass_barrier', true), '') <> 'on' THEN
    IF (to_jsonb(NEW) - 'lifecycle_state' - 'deleted_at' - 'deleted_by' - 'updated_at')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'lifecycle_state' - 'deleted_at' - 'deleted_by' - 'updated_at') THEN
      RAISE EXCEPTION 'krug_archived_read_only'
        USING ERRCODE = '42501',
              DETAIL = 'krug_id=' || OLD.id::text,
              HINT = 'Arhivirani Krug je samo za čitanje.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.krug_barrier_self() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS krug_archive_barrier_self ON public.krug;
CREATE TRIGGER krug_archive_barrier_self
  BEFORE UPDATE OR DELETE ON public.krug
  FOR EACH ROW EXECUTE FUNCTION public.krug_barrier_self();

-- 5) Kvorum punopravnih (otišli vlasnik arhive se ne broji) ----------------
CREATE OR REPLACE FUNCTION public.krug_full_member_count(_krug uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (SELECT count(*)::int
       FROM public.krug_membership m
      WHERE m.krug_id = _krug
        AND m.role = 'punopravni'::public.krug_membership_role
        AND m.user_id IS DISTINCT FROM (SELECT o.user_id FROM public.krug_ownership o WHERE o.krug_id = _krug))
    + (CASE
         WHEN EXISTS (
           SELECT 1 FROM public.krug_ownership o
             JOIN public.krug k ON k.id = o.krug_id
            WHERE o.krug_id = _krug
              AND k.lifecycle_state <> 'read_only'::public.krug_lifecycle_state
         ) THEN 1 ELSE 0 END);
$$;

REVOKE ALL ON FUNCTION public.krug_full_member_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_full_member_count(uuid) TO authenticated, service_role;

-- 6) Izlazak vlasnika bez nasljednika = arhiviranje -------------------------
CREATE OR REPLACE FUNCTION public.krug_owner_leave(p_krug_id uuid, p_successor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF v_krug.lifecycle_state = 'read_only'::public.krug_lifecycle_state THEN
    RETURN jsonb_build_object('outcome','noop_already_archived','krug_id',p_krug_id);
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
    -- Nema nasljednika → Krug ide u arhivu (samo za čitanje).
    -- Zapis o vlasništvu (`krug_ownership`) NAMJERNO ostaje: povijesni trag.
    SELECT * INTO v_owner_membership
      FROM public.krug_membership
     WHERE krug_id = p_krug_id AND user_id = v_user
     FOR UPDATE;

    IF FOUND THEN
      DELETE FROM public.krug_membership WHERE id = v_owner_membership.id;
    END IF;

    SELECT COALESCE(array_agg(user_id), ARRAY[]::uuid[]) INTO v_others
      FROM public.krug_membership
     WHERE krug_id = p_krug_id AND user_id <> v_user;

    -- Prijelaz u arhivu ide PRIJE brane (whitelist dopušta lifecycle_state).
    UPDATE public.krug
       SET lifecycle_state = 'read_only'::public.krug_lifecycle_state
     WHERE id = p_krug_id;

    INSERT INTO public.krug_membership_audit(krug_id, user_id, actor_id, event, role_at_event, metadata)
    VALUES (
      p_krug_id, v_user, v_user, 'owner_left',
      COALESCE(v_owner_membership.role::text, 'owner'),
      jsonb_build_object('archived', true, 'successor_id', NULL)
    );

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

    RETURN jsonb_build_object('outcome','ok_archived','krug_id',p_krug_id);
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
$function$;

-- 7) Brisanje arhive: preostali punopravni član smije pokrenuti ------------
CREATE OR REPLACE FUNCTION public.krug_request_deletion(p_krug_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_krug krug%ROWTYPE;
  v_full_count int;
  v_existing krug_deletion_request%ROWTYPE;
  v_snapshot uuid[];
  v_archived boolean;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('outcome','unauthorized');
  END IF;

  SELECT * INTO v_krug FROM public.krug WHERE id = p_krug_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','krug_not_found');
  END IF;
  IF v_krug.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('outcome','already_deleted');
  END IF;

  v_archived := v_krug.lifecycle_state = 'read_only'::public.krug_lifecycle_state;

  -- Arhiva: vlasnik je otišao, pa brisanje pokreće bilo koji punopravni član.
  IF NOT (
    public.krug_is_owner(p_krug_id, v_user)
    OR (v_archived AND EXISTS (
          SELECT 1 FROM public.krug_membership
           WHERE krug_id = p_krug_id AND user_id = v_user
             AND role = 'punopravni'::public.krug_membership_role
        ))
  ) THEN
    RETURN jsonb_build_object('outcome','not_owner');
  END IF;

  SELECT * INTO v_existing
    FROM public.krug_deletion_request
   WHERE krug_id = p_krug_id AND status = 'pending'
   FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome','request_already_pending');
  END IF;

  v_full_count := public.krug_full_member_count(p_krug_id);

  SELECT COALESCE(array_agg(DISTINCT u), ARRAY[]::uuid[]) INTO v_snapshot
    FROM public.krug_notify_all_members(p_krug_id) AS u;

  DELETE FROM public.krug_deletion_request WHERE krug_id = p_krug_id;

  IF v_full_count <= 1 THEN
    UPDATE public.krug
       SET deleted_at = now(),
           lifecycle_state = 'deleted'
     WHERE id = p_krug_id;
    INSERT INTO public.krug_deletion_request(krug_id, initiated_by, reason, status, resolved_at, resolved_by, member_snapshot)
    VALUES (p_krug_id, v_user, p_reason, 'approved', now(), v_user, v_snapshot);
    INSERT INTO public.krug_deletion_vote(krug_id, user_id, approve) VALUES (p_krug_id, v_user, true);

    IF v_snapshot IS NOT NULL AND array_length(v_snapshot, 1) IS NOT NULL THEN
      PERFORM public.krug_emit_notification(
        'krug_deleted',
        p_krug_id,
        v_user,
        NULL,
        NULL,
        'krug_deleted:' || p_krug_id::text,
        v_snapshot
      );
    END IF;

    RETURN jsonb_build_object('outcome','ok_deleted_solo','krug_id',p_krug_id);
  END IF;

  INSERT INTO public.krug_deletion_request(krug_id, initiated_by, reason, status, member_snapshot)
  VALUES (p_krug_id, v_user, p_reason, 'pending', v_snapshot);

  INSERT INTO public.krug_deletion_vote(krug_id, user_id, approve) VALUES (p_krug_id, v_user, true);

  PERFORM public.krug_emit_notification(
    'krug_deletion_requested',
    p_krug_id,
    v_user,
    NULL,
    p_krug_id,
    'krug_deletion_requested:' || p_krug_id::text,
    NULL
  );

  RETURN jsonb_build_object('outcome','ok_request_created','krug_id',p_krug_id,'full_member_count',v_full_count);
END;
$function$;

-- 8) Glasanje: isti kvorum (otišli vlasnik arhive se ne broji) -------------
CREATE OR REPLACE FUNCTION public.krug_vote_deletion(p_krug_id uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_req krug_deletion_request%ROWTYPE;
  v_full_count int;
  v_approve_count int;
  v_snapshot uuid[];
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('outcome','unauthorized');
  END IF;

  SELECT * INTO v_req FROM public.krug_deletion_request
   WHERE krug_id = p_krug_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('outcome','no_pending_request');
  END IF;

  IF NOT (public.krug_is_owner(p_krug_id, v_user)
          OR EXISTS (
            SELECT 1 FROM krug_membership
             WHERE krug_id = p_krug_id AND user_id = v_user AND role = 'punopravni'
          )) THEN
    RETURN jsonb_build_object('outcome','not_eligible');
  END IF;

  INSERT INTO public.krug_deletion_vote(krug_id, user_id, approve)
  VALUES (p_krug_id, v_user, p_approve)
  ON CONFLICT (krug_id, user_id) DO UPDATE
    SET approve = EXCLUDED.approve, voted_at = now();

  IF p_approve = false THEN
    UPDATE public.krug_deletion_request
       SET status='rejected', resolved_at=now(), resolved_by=v_user
     WHERE krug_id = p_krug_id;
    RETURN jsonb_build_object('outcome','ok_rejected','krug_id',p_krug_id);
  END IF;

  v_full_count := public.krug_full_member_count(p_krug_id);

  SELECT COUNT(*) INTO v_approve_count
    FROM public.krug_deletion_vote
   WHERE krug_id = p_krug_id AND approve = true;

  IF v_approve_count >= v_full_count THEN
    UPDATE public.krug
       SET deleted_at = now(), lifecycle_state = 'deleted'
     WHERE id = p_krug_id;
    UPDATE public.krug_deletion_request
       SET status='approved', resolved_at=now(), resolved_by=v_user
     WHERE krug_id = p_krug_id;

    v_snapshot := v_req.member_snapshot;
    IF v_snapshot IS NULL OR array_length(v_snapshot, 1) IS NULL THEN
      SELECT COALESCE(array_agg(DISTINCT u), ARRAY[]::uuid[]) INTO v_snapshot
        FROM public.krug_notify_all_members(p_krug_id) AS u;
    END IF;

    IF v_snapshot IS NOT NULL AND array_length(v_snapshot, 1) IS NOT NULL THEN
      PERFORM public.krug_emit_notification(
        'krug_deleted',
        p_krug_id,
        v_user,
        NULL,
        NULL,
        'krug_deleted:' || p_krug_id::text,
        v_snapshot
      );
    END IF;

    RETURN jsonb_build_object('outcome','ok_approved_and_deleted','krug_id',p_krug_id);
  END IF;

  RETURN jsonb_build_object(
    'outcome','ok_vote_recorded',
    'krug_id',p_krug_id,
    'approve_count',v_approve_count,
    'full_member_count',v_full_count
  );
END;
$function$;