
-- Tablice
CREATE TABLE public.krug_deletion_request (
  krug_id uuid PRIMARY KEY REFERENCES public.krug(id) ON DELETE CASCADE,
  initiated_by uuid NOT NULL REFERENCES auth.users(id),
  initiated_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','cancelled','rejected')),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.krug_deletion_vote (
  krug_id uuid NOT NULL REFERENCES public.krug_deletion_request(krug_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  approve boolean NOT NULL,
  voted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (krug_id, user_id)
);

GRANT SELECT ON public.krug_deletion_request TO authenticated;
GRANT SELECT ON public.krug_deletion_vote TO authenticated;
GRANT ALL ON public.krug_deletion_request TO service_role;
GRANT ALL ON public.krug_deletion_vote TO service_role;

ALTER TABLE public.krug_deletion_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.krug_deletion_vote ENABLE ROW LEVEL SECURITY;

-- SELECT: bilo koji član kruga vidi zahtjev i glasove (transparentnost)
CREATE POLICY krug_deletion_request_select_member
  ON public.krug_deletion_request FOR SELECT TO authenticated
  USING (public.krug_is_member(krug_id, auth.uid()));

CREATE POLICY krug_deletion_vote_select_member
  ON public.krug_deletion_vote FOR SELECT TO authenticated
  USING (public.krug_is_member(krug_id, auth.uid()));

-- Sve mutacije idu kroz SECURITY DEFINER RPC-eve. Nema direktnih INSERT/UPDATE/DELETE policy-ja.

-- RPC: pokreni zahtjev za brisanje
CREATE OR REPLACE FUNCTION public.krug_request_deletion(
  p_krug_id uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_krug krug%ROWTYPE;
  v_full_count int;
  v_existing krug_deletion_request%ROWTYPE;
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

  IF NOT public.krug_is_owner(p_krug_id, v_user) THEN
    RETURN jsonb_build_object('outcome','not_owner');
  END IF;

  -- Postojeći pending zahtjev?
  SELECT * INTO v_existing
    FROM public.krug_deletion_request
   WHERE krug_id = p_krug_id AND status = 'pending'
   FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome','request_already_pending');
  END IF;

  -- Broj punopravnih (owner + punopravni members)
  SELECT
    (CASE WHEN EXISTS (SELECT 1 FROM krug_ownership WHERE krug_id = p_krug_id) THEN 1 ELSE 0 END)
    + COALESCE((
        SELECT COUNT(*) FROM krug_membership
         WHERE krug_id = p_krug_id
           AND role = 'punopravni'
           AND user_id <> (SELECT user_id FROM krug_ownership WHERE krug_id = p_krug_id)
      ), 0)
  INTO v_full_count;

  -- Očisti eventualni stari resolved zahtjev za isti krug (samo jedan red po krugu zbog PK)
  DELETE FROM public.krug_deletion_request WHERE krug_id = p_krug_id;

  -- Solo path: odmah soft-delete
  IF v_full_count <= 1 THEN
    UPDATE public.krug
       SET deleted_at = now(),
           lifecycle_state = 'deleted'
     WHERE id = p_krug_id;
    INSERT INTO public.krug_deletion_request(krug_id, initiated_by, reason, status, resolved_at, resolved_by)
    VALUES (p_krug_id, v_user, p_reason, 'approved', now(), v_user);
    INSERT INTO public.krug_deletion_vote(krug_id, user_id, approve) VALUES (p_krug_id, v_user, true);
    RETURN jsonb_build_object('outcome','ok_deleted_solo','krug_id',p_krug_id);
  END IF;

  -- Multi path: kreiraj request + auto-vote vlasnika
  INSERT INTO public.krug_deletion_request(krug_id, initiated_by, reason, status)
  VALUES (p_krug_id, v_user, p_reason, 'pending');
  INSERT INTO public.krug_deletion_vote(krug_id, user_id, approve) VALUES (p_krug_id, v_user, true);

  RETURN jsonb_build_object('outcome','ok_request_created','krug_id',p_krug_id,'full_member_count',v_full_count);
END;
$$;

-- RPC: glasaj
CREATE OR REPLACE FUNCTION public.krug_vote_deletion(
  p_krug_id uuid,
  p_approve boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_req krug_deletion_request%ROWTYPE;
  v_full_count int;
  v_approve_count int;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('outcome','unauthorized');
  END IF;

  SELECT * INTO v_req FROM public.krug_deletion_request
   WHERE krug_id = p_krug_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('outcome','no_pending_request');
  END IF;

  -- Punopravni član?
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

  -- Reject odmah otkazuje
  IF p_approve = false THEN
    UPDATE public.krug_deletion_request
       SET status='rejected', resolved_at=now(), resolved_by=v_user
     WHERE krug_id = p_krug_id;
    RETURN jsonb_build_object('outcome','ok_rejected','krug_id',p_krug_id);
  END IF;

  -- Provjera unanimnosti
  SELECT
    (CASE WHEN EXISTS (SELECT 1 FROM krug_ownership WHERE krug_id = p_krug_id) THEN 1 ELSE 0 END)
    + COALESCE((
        SELECT COUNT(*) FROM krug_membership
         WHERE krug_id = p_krug_id
           AND role = 'punopravni'
           AND user_id <> (SELECT user_id FROM krug_ownership WHERE krug_id = p_krug_id)
      ), 0)
  INTO v_full_count;

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
    RETURN jsonb_build_object('outcome','ok_approved_and_deleted','krug_id',p_krug_id);
  END IF;

  RETURN jsonb_build_object(
    'outcome','ok_vote_recorded',
    'krug_id',p_krug_id,
    'approve_count',v_approve_count,
    'full_member_count',v_full_count
  );
END;
$$;

-- RPC: povuci zahtjev (samo vlasnik)
CREATE OR REPLACE FUNCTION public.krug_cancel_deletion(
  p_krug_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_req krug_deletion_request%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('outcome','unauthorized');
  END IF;
  IF NOT public.krug_is_owner(p_krug_id, v_user) THEN
    RETURN jsonb_build_object('outcome','not_owner');
  END IF;

  SELECT * INTO v_req FROM public.krug_deletion_request
   WHERE krug_id = p_krug_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('outcome','no_pending_request');
  END IF;

  UPDATE public.krug_deletion_request
     SET status='cancelled', resolved_at=now(), resolved_by=v_user
   WHERE krug_id = p_krug_id;

  RETURN jsonb_build_object('outcome','ok_cancelled','krug_id',p_krug_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.krug_request_deletion(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.krug_vote_deletion(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.krug_cancel_deletion(uuid) TO authenticated;

-- Hard purge nakon 30 dana (poziva ga cron edge function)
CREATE OR REPLACE FUNCTION public.krug_purge_deleted(p_older_than_days int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  WITH del AS (
    DELETE FROM public.krug
     WHERE deleted_at IS NOT NULL
       AND deleted_at < now() - make_interval(days => p_older_than_days)
     RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM del;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_purge_deleted(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.krug_purge_deleted(int) TO service_role;
