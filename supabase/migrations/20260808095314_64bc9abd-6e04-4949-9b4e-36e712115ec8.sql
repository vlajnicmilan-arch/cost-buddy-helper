-- =====================================================================
-- Krug: self-leave (asymmetric exit) — governance requirement.
-- Membership removal by owner already exists via RLS DELETE policy.
-- Self-leave is FORBIDDEN by that policy on purpose, so it goes through
-- this SECURITY DEFINER RPC only.
-- =====================================================================

-- 1) Append-only lifecycle audit
CREATE TABLE IF NOT EXISTS public.krug_membership_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  krug_id uuid NOT NULL REFERENCES public.krug(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  actor_id uuid,
  event text NOT NULL,
  role_at_event text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS krug_membership_audit_krug_idx
  ON public.krug_membership_audit (krug_id, created_at DESC);

GRANT SELECT ON public.krug_membership_audit TO authenticated;
GRANT ALL ON public.krug_membership_audit TO service_role;

ALTER TABLE public.krug_membership_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "krug_membership_audit_select_member" ON public.krug_membership_audit;
CREATE POLICY "krug_membership_audit_select_member"
  ON public.krug_membership_audit FOR SELECT
  TO authenticated
  USING (public.krug_is_member(krug_id, auth.uid()));

-- Append-only: no INSERT/UPDATE/DELETE policies for clients, and hard
-- revoke so even a future permissive policy cannot rewrite history.
REVOKE INSERT, UPDATE, DELETE ON public.krug_membership_audit FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.krug_membership_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'krug_membership_audit_is_append_only';
END;
$$;

DROP TRIGGER IF EXISTS krug_membership_audit_no_update ON public.krug_membership_audit;
CREATE TRIGGER krug_membership_audit_no_update
  BEFORE UPDATE OR DELETE ON public.krug_membership_audit
  FOR EACH ROW EXECUTE FUNCTION public.krug_membership_audit_immutable();

-- 2) krug_leave — member removes THEMSELVES, no consent required.
CREATE OR REPLACE FUNCTION public.krug_leave(p_krug_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_krug krug%ROWTYPE;
  v_membership krug_membership%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('outcome','unauthorized');
  END IF;

  SELECT * INTO v_krug FROM public.krug WHERE id = p_krug_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','krug_not_found');
  END IF;

  -- Owner exit is a separate flow (ownership transfer / inheritance).
  IF public.krug_is_owner(p_krug_id, v_user) THEN
    RETURN jsonb_build_object('outcome','owner_cannot_leave');
  END IF;

  SELECT * INTO v_membership
    FROM public.krug_membership
   WHERE krug_id = p_krug_id AND user_id = v_user
   FOR UPDATE;

  IF NOT FOUND THEN
    -- Idempotent: repeated call after a successful leave is a no-op.
    RETURN jsonb_build_object('outcome','noop_not_member');
  END IF;

  DELETE FROM public.krug_membership WHERE id = v_membership.id;

  -- Settlement ledger, split shares and personal expenses are intentionally
  -- untouched: leaving must not rewrite "who owes whom" history.
  INSERT INTO public.krug_membership_audit(krug_id, user_id, actor_id, event, role_at_event, metadata)
  VALUES (
    p_krug_id, v_user, v_user, 'member_left', v_membership.role::text,
    jsonb_build_object('membership_id', v_membership.id)
  );

  PERFORM public.krug_emit_notification(
    'krug_member_left',
    p_krug_id,
    v_user,
    NULL,
    NULL,
    'krug_member_left:' || p_krug_id::text || ':' || v_user::text,
    NULL
  );

  RETURN jsonb_build_object('outcome','ok_left','krug_id',p_krug_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_leave(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_leave(uuid) TO authenticated, service_role;