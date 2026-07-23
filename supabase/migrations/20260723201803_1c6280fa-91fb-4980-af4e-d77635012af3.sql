
-- =========================================================
-- SECURITY HARDENING: investor scope, removed member, profiles
-- =========================================================

-- 1) HELPERS ------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_project_participant_active(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = _project_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id
      AND user_id = _user_id
      AND role <> 'investor'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_investor(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id
      AND user_id = _user_id
      AND role = 'investor'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_project_participant_active(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_investor(uuid, uuid) TO authenticated;

-- 2) EXPENSES ---------------------------------------------------
-- Project-scoped expenses require ACTIVE non-investor participation for both
-- read and write. Off-project expenses keep the previous "own row / income
-- source member" semantics.

DROP POLICY IF EXISTS "Users can view their own expenses" ON public.expenses;
CREATE POLICY "Users can view their own expenses" ON public.expenses
FOR SELECT
USING (
  CASE
    WHEN project_id IS NOT NULL THEN
      public.is_project_participant_active(project_id, auth.uid())
    ELSE
      auth.uid() = user_id
      OR (income_source_id IS NOT NULL AND public.is_income_source_member(income_source_id, auth.uid()))
  END
);

DROP POLICY IF EXISTS "Users can create their own expenses" ON public.expenses;
CREATE POLICY "Users can create their own expenses" ON public.expenses
FOR INSERT
WITH CHECK (
  CASE
    WHEN project_id IS NOT NULL THEN
      auth.uid() = user_id
      AND public.is_project_participant_active(project_id, auth.uid())
    ELSE
      auth.uid() = user_id
      OR (income_source_id IS NOT NULL AND public.is_income_source_member(income_source_id, auth.uid()))
  END
);

DROP POLICY IF EXISTS "Users can update their own expenses" ON public.expenses;
CREATE POLICY "Users can update their own expenses" ON public.expenses
FOR UPDATE
USING (
  CASE
    WHEN project_id IS NOT NULL THEN
      public.is_project_participant_active(project_id, auth.uid())
      AND (auth.uid() = user_id OR public.is_project_owner(project_id, auth.uid()))
    ELSE
      auth.uid() = user_id
      OR (income_source_id IS NOT NULL AND public.is_income_source_owner(auth.uid(), income_source_id))
  END
)
WITH CHECK (
  CASE
    WHEN project_id IS NOT NULL THEN
      public.is_project_participant_active(project_id, auth.uid())
      AND (auth.uid() = user_id OR public.is_project_owner(project_id, auth.uid()))
    ELSE
      auth.uid() = user_id
      OR (income_source_id IS NOT NULL AND public.is_income_source_owner(auth.uid(), income_source_id))
  END
);

DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.expenses;
CREATE POLICY "Users can delete their own expenses" ON public.expenses
FOR DELETE
USING (
  CASE
    WHEN project_id IS NOT NULL THEN
      public.is_project_participant_active(project_id, auth.uid())
      AND (auth.uid() = user_id OR public.is_project_owner(project_id, auth.uid()))
    ELSE
      auth.uid() = user_id
      OR (income_source_id IS NOT NULL AND public.is_income_source_owner(auth.uid(), income_source_id))
  END
);

-- 3) PROJECT_MILESTONES ------------------------------------------
-- Investor is denied direct SELECT; safe RPC below returns whitelisted cols.

DROP POLICY IF EXISTS "Project members can view milestones" ON public.project_milestones;
CREATE POLICY "Project participants can view milestones" ON public.project_milestones
FOR SELECT
USING (public.is_project_participant_active(project_id, auth.uid()));

-- 4) PROJECT_FUNDING ---------------------------------------------
-- Investor sees only rows whose income_source is theirs; participants see all.

DROP POLICY IF EXISTS "Project members can view funding" ON public.project_funding;
CREATE POLICY "Project participants can view funding" ON public.project_funding
FOR SELECT
USING (
  public.is_project_participant_active(project_id, auth.uid())
  OR (
    public.is_project_investor(project_id, auth.uid())
    AND income_source_id IN (
      SELECT id FROM public.income_sources WHERE user_id = auth.uid()
    )
  )
);

-- 5) PROJECT_DOCUMENTS -------------------------------------------
-- Investor denied.

DROP POLICY IF EXISTS "Members can view project documents" ON public.project_documents;
CREATE POLICY "Project participants can view documents" ON public.project_documents
FOR SELECT
USING (public.is_project_participant_active(project_id, auth.uid()));

-- 6) INVESTOR PHASES RPC ------------------------------------------
CREATE OR REPLACE FUNCTION public.get_investor_project_phases(_project_id uuid)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  name text,
  description text,
  status text,
  start_date date,
  due_date date,
  actual_start_date date,
  actual_end_date date,
  sort_order integer,
  investor_price numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id, m.project_id, m.name, m.description,
    m.status, m.start_date, m.due_date,
    m.actual_start_date, m.actual_end_date,
    m.sort_order, m.investor_price
  FROM public.project_milestones m
  WHERE m.project_id = _project_id
    AND m.deleted_at IS NULL
    AND (
      public.is_project_participant_active(_project_id, auth.uid())
      OR public.is_project_investor(_project_id, auth.uid())
    )
  ORDER BY m.sort_order NULLS LAST, m.due_date NULLS LAST;
$$;
REVOKE EXECUTE ON FUNCTION public.get_investor_project_phases(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_investor_project_phases(uuid) TO authenticated;

-- 7) PROFILES: safe public projection ----------------------------
-- No email column exists on public.profiles today; email lives in auth.users
-- and is never exposed. This view is defense-in-depth: if profiles ever gains
-- a sensitive column, cross-user reads still only get whitelisted fields.

CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = false)
AS
SELECT user_id, display_name
FROM public.profiles
WHERE deleted_at IS NULL;

GRANT SELECT ON public.profiles_public TO authenticated, anon;
