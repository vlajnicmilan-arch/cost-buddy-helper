-- T2: Core Krug RLS (Implementation Sprint v1.1)

-- ============== HELPERS (SECURITY DEFINER, stable) ==============

CREATE OR REPLACE FUNCTION public.krug_is_owner(_krug uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.krug_ownership
    WHERE krug_id = _krug AND user_id = _user
  );
$$;

CREATE OR REPLACE FUNCTION public.krug_is_member(_krug uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Owner uvijek je "member" (čak i za soft-deletan krug, za restore).
  -- Ostali članovi: samo ako krug NIJE soft-deletan.
  SELECT
    EXISTS (
      SELECT 1 FROM public.krug_ownership
      WHERE krug_id = _krug AND user_id = _user
    )
    OR EXISTS (
      SELECT 1
      FROM public.krug_membership m
      JOIN public.krug k ON k.id = m.krug_id
      WHERE m.krug_id = _krug
        AND m.user_id = _user
        AND k.deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.krug_is_full_member(_krug uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.krug_is_owner(_krug, _user)
    OR EXISTS (
      SELECT 1
      FROM public.krug_membership m
      JOIN public.krug k ON k.id = m.krug_id
      WHERE m.krug_id = _krug
        AND m.user_id = _user
        AND m.role = 'punopravni'::public.krug_membership_role
        AND k.deleted_at IS NULL
    );
$$;

REVOKE EXECUTE ON FUNCTION public.krug_is_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.krug_is_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.krug_is_full_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_is_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.krug_is_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.krug_is_full_member(uuid, uuid) TO authenticated, service_role;

-- ============== KRUG POLICIES ==============

CREATE POLICY "krug_select_member"
  ON public.krug FOR SELECT TO authenticated
  USING (public.krug_is_member(id, auth.uid()));

CREATE POLICY "krug_insert_authenticated"
  ON public.krug FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

CREATE POLICY "krug_update_owner"
  ON public.krug FOR UPDATE TO authenticated
  USING (public.krug_is_owner(id, auth.uid()))
  WITH CHECK (public.krug_is_owner(id, auth.uid()));

-- Hard DELETE blokiran u v1; soft delete ide kroz UPDATE (deleted_at).
-- (Bez DELETE policy = blokirano.)

-- ============== KRUG_OWNERSHIP POLICIES ==============

CREATE POLICY "krug_ownership_select_member"
  ON public.krug_ownership FOR SELECT TO authenticated
  USING (public.krug_is_member(krug_id, auth.uid()));

-- INSERT samo kroz bootstrap trigger (SECURITY DEFINER); direktan INSERT iz klijenta blokiran.
-- UPDATE/DELETE blokirani u v1 (owner transfer = kasnije).

-- ============== KRUG_MEMBERSHIP POLICIES ==============

CREATE POLICY "krug_membership_select_member"
  ON public.krug_membership FOR SELECT TO authenticated
  USING (public.krug_is_member(krug_id, auth.uid()));

-- INSERT: vlasnik dodaje članove. Bootstrap trigger ide kroz SECURITY DEFINER pa zaobilazi RLS.
CREATE POLICY "krug_membership_insert_owner"
  ON public.krug_membership FOR INSERT TO authenticated
  WITH CHECK (public.krug_is_owner(krug_id, auth.uid()));

-- UPDATE: vlasnik mijenja role.
CREATE POLICY "krug_membership_update_owner"
  ON public.krug_membership FOR UPDATE TO authenticated
  USING (public.krug_is_owner(krug_id, auth.uid()))
  WITH CHECK (public.krug_is_owner(krug_id, auth.uid()));

-- DELETE: vlasnik uklanja, ali ne smije ukloniti sam sebe iz membershipa (bootstrap invariant).
CREATE POLICY "krug_membership_delete_owner_not_self"
  ON public.krug_membership FOR DELETE TO authenticated
  USING (
    public.krug_is_owner(krug_id, auth.uid())
    AND user_id <> auth.uid()
  );
