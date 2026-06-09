
-- =====================================================
-- F8–F10 Permissions Hardening (single atomic migration)
-- =====================================================

-- 1. Helper functions ---------------------------------------------------

-- Vraca efektivnu rolu korisnika na projektu:
--   'owner'   ako je vlasnik projekta
--   'manager' | 'member' | 'worker' | 'viewer'  iz project_members.role
--   NULL ako nije ni vlasnik ni clan
CREATE OR REPLACE FUNCTION public.get_project_role(_project_id uuid, _user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF _project_id IS NULL OR _user_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = _user_id) THEN
    RETURN 'owner';
  END IF;
  SELECT role INTO v_role FROM public.project_members
   WHERE project_id = _project_id AND user_id = _user_id LIMIT 1;
  RETURN v_role;
END;
$$;

-- Manager = owner ili clan s rolom 'manager'
CREATE OR REPLACE FUNCTION public.is_project_manager(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_project_role(_project_id, _user_id) IN ('owner','manager');
$$;

-- Moze li korisnik unositi vlastiti rad (sve role osim viewer; viewer = read-only)
CREATE OR REPLACE FUNCTION public.can_log_own_work(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_project_role(_project_id, _user_id) IN ('owner','manager','member','worker');
$$;

-- 2. Defensive backfill ------------------------------------------------
-- Trenutno u bazi 0 ownera bez member-reda, ali driver konzistencije:
INSERT INTO public.project_members (project_id, user_id, role, display_name)
SELECT p.id, p.user_id, 'manager',
       (SELECT display_name FROM public.profiles WHERE user_id = p.user_id)
  FROM public.projects p
 WHERE NOT EXISTS (
   SELECT 1 FROM public.project_members m
    WHERE m.project_id = p.id AND m.user_id = p.user_id
 )
ON CONFLICT DO NOTHING;

-- 3. project_workers ---------------------------------------------------
DROP POLICY IF EXISTS "Project members can add workers"    ON public.project_workers;
DROP POLICY IF EXISTS "Project members can update workers" ON public.project_workers;

CREATE POLICY "Project managers can add workers"
  ON public.project_workers FOR INSERT TO authenticated
  WITH CHECK (public.is_project_manager(project_id, auth.uid()));

CREATE POLICY "Project managers can update workers"
  ON public.project_workers FOR UPDATE TO authenticated
  USING (public.is_project_manager(project_id, auth.uid()))
  WITH CHECK (public.is_project_manager(project_id, auth.uid()));

-- 4. project_work_logs -------------------------------------------------
DROP POLICY IF EXISTS "Members can insert their own work logs" ON public.project_work_logs;
DROP POLICY IF EXISTS "Authors can update their own work logs" ON public.project_work_logs;
DROP POLICY IF EXISTS "Authors or owners can delete work logs" ON public.project_work_logs;

CREATE POLICY "Non-viewer members can insert own work logs"
  ON public.project_work_logs FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.can_log_own_work(project_id, auth.uid())
  );

-- Autor smije editirati svoj log dok je jos aktivan ne-viewer clan;
-- manager smije korigirati tudji log (audit).
CREATE POLICY "Authors or managers can update work logs"
  ON public.project_work_logs FOR UPDATE TO authenticated
  USING (
    (auth.uid() = user_id AND public.can_log_own_work(project_id, auth.uid()))
    OR public.is_project_manager(project_id, auth.uid())
  )
  WITH CHECK (
    (auth.uid() = user_id AND public.can_log_own_work(project_id, auth.uid()))
    OR public.is_project_manager(project_id, auth.uid())
  );

CREATE POLICY "Authors or managers can delete work logs"
  ON public.project_work_logs FOR DELETE TO authenticated
  USING (
    (auth.uid() = user_id AND public.can_log_own_work(project_id, auth.uid()))
    OR public.is_project_manager(project_id, auth.uid())
  );

-- 5. project_work_entries ---------------------------------------------
DROP POLICY IF EXISTS "Project members can add work entries"  ON public.project_work_entries;
DROP POLICY IF EXISTS "Project owners can delete work entries" ON public.project_work_entries;

-- INSERT: manager za bilo koga; ne-viewer clan samo za svoj project_workers red
CREATE POLICY "Managers or own worker can add work entries"
  ON public.project_work_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_manager(project_id, auth.uid())
    OR (
      public.can_log_own_work(project_id, auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.project_workers w
         WHERE w.id = worker_id AND w.user_id = auth.uid()
      )
    )
  );

-- UPDATE: do sada NEMA explicit policy (tihi 0-row update). Dodajemo:
CREATE POLICY "Managers or own worker can update work entries"
  ON public.project_work_entries FOR UPDATE TO authenticated
  USING (
    public.is_project_manager(project_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.project_workers w
       WHERE w.id = worker_id AND w.user_id = auth.uid()
        AND public.can_log_own_work(project_id, auth.uid())
    )
  )
  WITH CHECK (
    public.is_project_manager(project_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.project_workers w
       WHERE w.id = worker_id AND w.user_id = auth.uid()
        AND public.can_log_own_work(project_id, auth.uid())
    )
  );

CREATE POLICY "Managers can delete work entries"
  ON public.project_work_entries FOR DELETE TO authenticated
  USING (public.is_project_manager(project_id, auth.uid()));

-- 6. project_milestones -----------------------------------------------
DROP POLICY IF EXISTS "Project owners can create milestones" ON public.project_milestones;
DROP POLICY IF EXISTS "Project owners can update milestones" ON public.project_milestones;
DROP POLICY IF EXISTS "Project owners can delete milestones" ON public.project_milestones;

CREATE POLICY "Project managers can create milestones"
  ON public.project_milestones FOR INSERT TO authenticated
  WITH CHECK (public.is_project_manager(project_id, auth.uid()));
CREATE POLICY "Project managers can update milestones"
  ON public.project_milestones FOR UPDATE TO authenticated
  USING (public.is_project_manager(project_id, auth.uid()))
  WITH CHECK (public.is_project_manager(project_id, auth.uid()));
CREATE POLICY "Project managers can delete milestones"
  ON public.project_milestones FOR DELETE TO authenticated
  USING (public.is_project_manager(project_id, auth.uid()));

-- 7. project_funding --------------------------------------------------
DROP POLICY IF EXISTS "Project owners can manage funding"  ON public.project_funding;
DROP POLICY IF EXISTS "Project owners can update funding"  ON public.project_funding;
DROP POLICY IF EXISTS "Project owners can delete funding"  ON public.project_funding;

CREATE POLICY "Project managers can insert funding"
  ON public.project_funding FOR INSERT TO authenticated
  WITH CHECK (public.is_project_manager(project_id, auth.uid()));
CREATE POLICY "Project managers can update funding"
  ON public.project_funding FOR UPDATE TO authenticated
  USING (public.is_project_manager(project_id, auth.uid()))
  WITH CHECK (public.is_project_manager(project_id, auth.uid()));
CREATE POLICY "Project managers can delete funding"
  ON public.project_funding FOR DELETE TO authenticated
  USING (public.is_project_manager(project_id, auth.uid()));

-- 8. project_collaborators --------------------------------------------
DROP POLICY IF EXISTS "Project owners can create collaborators" ON public.project_collaborators;
DROP POLICY IF EXISTS "Project owners can update collaborators" ON public.project_collaborators;
DROP POLICY IF EXISTS "Project owners can delete collaborators" ON public.project_collaborators;

CREATE POLICY "Project managers can create collaborators"
  ON public.project_collaborators FOR INSERT TO authenticated
  WITH CHECK (public.is_project_manager(project_id, auth.uid()));
CREATE POLICY "Project managers can update collaborators"
  ON public.project_collaborators FOR UPDATE TO authenticated
  USING (public.is_project_manager(project_id, auth.uid()))
  WITH CHECK (public.is_project_manager(project_id, auth.uid()));
CREATE POLICY "Project managers can delete collaborators"
  ON public.project_collaborators FOR DELETE TO authenticated
  USING (public.is_project_manager(project_id, auth.uid()));

-- 9. project_invitations ----------------------------------------------
DROP POLICY IF EXISTS "Project owners can create invitations" ON public.project_invitations;
DROP POLICY IF EXISTS "Project owners can update invitations" ON public.project_invitations;
DROP POLICY IF EXISTS "Project owners can delete invitations" ON public.project_invitations;
DROP POLICY IF EXISTS "Project owners can view invitations"   ON public.project_invitations;

CREATE POLICY "Project managers can view invitations"
  ON public.project_invitations FOR SELECT TO authenticated
  USING (public.is_project_manager(project_id, auth.uid()));
CREATE POLICY "Project managers can create invitations"
  ON public.project_invitations FOR INSERT TO authenticated
  WITH CHECK (public.is_project_manager(project_id, auth.uid()));
CREATE POLICY "Project managers can update invitations"
  ON public.project_invitations FOR UPDATE TO authenticated
  USING (public.is_project_manager(project_id, auth.uid()))
  WITH CHECK (public.is_project_manager(project_id, auth.uid()));
CREATE POLICY "Project managers can delete invitations"
  ON public.project_invitations FOR DELETE TO authenticated
  USING (public.is_project_manager(project_id, auth.uid()));

-- 10. project_members --------------------------------------------------
-- Manager smije pozivati/uklanjati ne-managere; promovirati ili degradirati
-- managera smije iskljucivo vlasnik. UPDATE vlastitog konteksta ostaje.
DROP POLICY IF EXISTS "Project owners can add members"    ON public.project_members;
DROP POLICY IF EXISTS "Project owners can remove members" ON public.project_members;
DROP POLICY IF EXISTS "Project owners can update members" ON public.project_members;

CREATE POLICY "Project managers can add non-managers; owner adds managers"
  ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_owner(project_id, auth.uid())
    OR (public.is_project_manager(project_id, auth.uid()) AND role <> 'manager')
  );

CREATE POLICY "Project managers can remove non-managers; owner removes managers"
  ON public.project_members FOR DELETE TO authenticated
  USING (
    public.is_project_owner(project_id, auth.uid())
    OR (public.is_project_manager(project_id, auth.uid()) AND role <> 'manager')
  );

CREATE POLICY "Project managers can update non-managers; owner manages managers"
  ON public.project_members FOR UPDATE TO authenticated
  USING (
    public.is_project_owner(project_id, auth.uid())
    OR (public.is_project_manager(project_id, auth.uid()) AND role <> 'manager')
  )
  WITH CHECK (
    public.is_project_owner(project_id, auth.uid())
    OR (public.is_project_manager(project_id, auth.uid()) AND role <> 'manager')
  );

-- "Members can update own context" ostaje netaknuto.

-- 11. project_member_permissions --------------------------------------
-- Ostaje strogo OWNER-only (svjesna odluka). Bez izmjena.
