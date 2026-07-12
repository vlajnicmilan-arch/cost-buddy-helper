-- F8–F10 realign retry: ukloniti 'manager'

-- 0) Drop trigger
DROP TRIGGER IF EXISTS add_project_owner_as_member_trigger ON public.projects;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tgname FROM pg_trigger
     WHERE tgrelid = 'public.projects'::regclass
       AND NOT tgisinternal
       AND tgfoid = 'public.add_project_owner_as_member()'::regprocedure
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.projects', r.tgname);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.add_project_owner_as_member();

-- 1) DELETE owner-self-seed manager rowova
DELETE FROM public.project_members pm
 WHERE pm.role = 'manager'
   AND EXISTS (
     SELECT 1 FROM public.projects p
      WHERE p.id = pm.project_id AND p.user_id = pm.user_id
   );

UPDATE public.project_members SET role = 'member' WHERE role = 'manager';
UPDATE public.project_invitations SET role = 'member' WHERE role = 'manager';

-- 2) Policies sweep

-- project_workers
DROP POLICY IF EXISTS "Project managers can add workers" ON public.project_workers;
DROP POLICY IF EXISTS "Project managers can update workers" ON public.project_workers;
CREATE POLICY "Project owners can add workers"
  ON public.project_workers FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can update workers"
  ON public.project_workers FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()))
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));

-- project_work_logs
DROP POLICY IF EXISTS "Non-viewer members can insert own work logs" ON public.project_work_logs;
DROP POLICY IF EXISTS "Authors or managers can update work logs" ON public.project_work_logs;
DROP POLICY IF EXISTS "Authors or managers can delete work logs" ON public.project_work_logs;
CREATE POLICY "Non-viewer members can insert own work logs"
  ON public.project_work_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_log_own_work(project_id, auth.uid()));
CREATE POLICY "Authors or owner can update work logs"
  ON public.project_work_logs FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id AND public.can_log_own_work(project_id, auth.uid())) OR public.is_project_owner(project_id, auth.uid()))
  WITH CHECK ((auth.uid() = user_id AND public.can_log_own_work(project_id, auth.uid())) OR public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Authors or owner can delete work logs"
  ON public.project_work_logs FOR DELETE TO authenticated
  USING ((auth.uid() = user_id AND public.can_log_own_work(project_id, auth.uid())) OR public.is_project_owner(project_id, auth.uid()));

-- project_work_entries
DROP POLICY IF EXISTS "Managers or own worker can add work entries" ON public.project_work_entries;
DROP POLICY IF EXISTS "Managers or own worker can update work entries" ON public.project_work_entries;
DROP POLICY IF EXISTS "Managers can delete work entries" ON public.project_work_entries;
CREATE POLICY "Owner or own worker can add work entries"
  ON public.project_work_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_owner(project_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.project_workers w WHERE w.id = worker_id AND w.user_id = auth.uid() AND public.can_log_own_work(project_id, auth.uid()))
  );
CREATE POLICY "Owner or own worker can update work entries"
  ON public.project_work_entries FOR UPDATE TO authenticated
  USING (
    public.is_project_owner(project_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.project_workers w WHERE w.id = worker_id AND w.user_id = auth.uid() AND public.can_log_own_work(project_id, auth.uid()))
  )
  WITH CHECK (
    public.is_project_owner(project_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.project_workers w WHERE w.id = worker_id AND w.user_id = auth.uid() AND public.can_log_own_work(project_id, auth.uid()))
  );
CREATE POLICY "Owner can delete work entries"
  ON public.project_work_entries FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));

-- project_milestones
DROP POLICY IF EXISTS "Project managers can create milestones" ON public.project_milestones;
DROP POLICY IF EXISTS "Project managers can update milestones" ON public.project_milestones;
DROP POLICY IF EXISTS "Project managers can delete milestones" ON public.project_milestones;
CREATE POLICY "Project owners can create milestones"
  ON public.project_milestones FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can update milestones"
  ON public.project_milestones FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()))
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can delete milestones"
  ON public.project_milestones FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));

-- project_funding
DROP POLICY IF EXISTS "Project managers can insert funding" ON public.project_funding;
DROP POLICY IF EXISTS "Project managers can update funding" ON public.project_funding;
DROP POLICY IF EXISTS "Project managers can delete funding" ON public.project_funding;
CREATE POLICY "Project owners can insert funding"
  ON public.project_funding FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can update funding"
  ON public.project_funding FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()))
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can delete funding"
  ON public.project_funding FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));

-- project_collaborators
DROP POLICY IF EXISTS "Project managers can create collaborators" ON public.project_collaborators;
DROP POLICY IF EXISTS "Project managers can update collaborators" ON public.project_collaborators;
DROP POLICY IF EXISTS "Project managers can delete collaborators" ON public.project_collaborators;
CREATE POLICY "Project owners can create collaborators"
  ON public.project_collaborators FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can update collaborators"
  ON public.project_collaborators FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()))
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can delete collaborators"
  ON public.project_collaborators FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));

-- project_invitations
DROP POLICY IF EXISTS "Project managers can view invitations" ON public.project_invitations;
DROP POLICY IF EXISTS "Project managers can create invitations" ON public.project_invitations;
DROP POLICY IF EXISTS "Project managers can update invitations" ON public.project_invitations;
DROP POLICY IF EXISTS "Project managers can delete invitations" ON public.project_invitations;
CREATE POLICY "Project owners can view invitations"
  ON public.project_invitations FOR SELECT TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can create invitations"
  ON public.project_invitations FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can update invitations"
  ON public.project_invitations FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()))
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can delete invitations"
  ON public.project_invitations FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));

-- project_members
DROP POLICY IF EXISTS "Managers can insert members" ON public.project_members;
DROP POLICY IF EXISTS "Managers can update members" ON public.project_members;
DROP POLICY IF EXISTS "Managers can delete members" ON public.project_members;
DROP POLICY IF EXISTS "Project managers can insert members" ON public.project_members;
DROP POLICY IF EXISTS "Project managers can update members" ON public.project_members;
DROP POLICY IF EXISTS "Project managers can delete members" ON public.project_members;
DROP POLICY IF EXISTS "Project managers can add non-managers; owner adds managers" ON public.project_members;
DROP POLICY IF EXISTS "Project managers can remove non-managers; owner removes manager" ON public.project_members;
DROP POLICY IF EXISTS "Project managers can update non-managers; owner manages manager" ON public.project_members;

CREATE POLICY "Project owners can insert members"
  ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can update members"
  ON public.project_members FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()))
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "Project owners can delete members"
  ON public.project_members FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));

-- 3) can_log_own_work — remove 'manager'
CREATE OR REPLACE FUNCTION public.can_log_own_work(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.get_project_role(_project_id, _user_id) IN ('owner','member','worker');
$$;

-- 3b) expenses policies still reference is_project_manager; realign before drop
DROP POLICY IF EXISTS "Users can update their own expenses" ON public.expenses;
CREATE POLICY "Users can update their own expenses"
  ON public.expenses FOR UPDATE TO authenticated
  USING (
    (auth.uid() = user_id)
    OR ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id))
    OR ((project_id IS NOT NULL) AND public.is_project_owner(project_id, auth.uid()))
  )
  WITH CHECK (
    (auth.uid() = user_id)
    OR ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id))
    OR ((project_id IS NOT NULL) AND public.is_project_owner(project_id, auth.uid()))
  );

DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.expenses;
CREATE POLICY "Users can delete their own expenses"
  ON public.expenses FOR DELETE TO authenticated
  USING (
    (auth.uid() = user_id)
    OR ((income_source_id IS NOT NULL) AND is_income_source_owner(auth.uid(), income_source_id))
    OR ((project_id IS NOT NULL) AND public.is_project_owner(project_id, auth.uid()))
  );

-- 4) Drop is_project_manager
DROP FUNCTION IF EXISTS public.is_project_manager(uuid, uuid);

-- 5) CHECK constraints
ALTER TABLE public.project_members
  DROP CONSTRAINT IF EXISTS project_members_role_check;
ALTER TABLE public.project_members
  ADD CONSTRAINT project_members_role_check
  CHECK (role IN ('member','viewer','worker'));

ALTER TABLE public.project_invitations
  DROP CONSTRAINT IF EXISTS project_invitations_role_check;
ALTER TABLE public.project_invitations
  ADD CONSTRAINT project_invitations_role_check
  CHECK (role IN ('member','viewer','worker'));
