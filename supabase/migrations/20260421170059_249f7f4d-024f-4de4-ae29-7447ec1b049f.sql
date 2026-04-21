-- Add contingency flag to milestones
ALTER TABLE public.project_milestones
  ADD COLUMN IF NOT EXISTS is_contingency boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_project_milestones_contingency
  ON public.project_milestones(project_id) WHERE is_contingency = true;

-- Revision change type enum
DO $$ BEGIN
  CREATE TYPE public.milestone_revision_type AS ENUM ('overrun', 'saving', 'scope_change', 'correction');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Coverage method enum (how the budget delta was balanced)
DO $$ BEGIN
  CREATE TYPE public.milestone_revision_coverage AS ENUM ('increase_total', 'transfer', 'contingency');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Revisions table
CREATE TABLE IF NOT EXISTS public.milestone_budget_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES public.project_milestones(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  previous_amount numeric NOT NULL DEFAULT 0,
  new_amount numeric NOT NULL DEFAULT 0,
  delta numeric GENERATED ALWAYS AS (new_amount - previous_amount) STORED,
  reason text NOT NULL,
  change_type public.milestone_revision_type NULL,
  coverage public.milestone_revision_coverage NOT NULL DEFAULT 'increase_total',
  linked_milestone_id uuid NULL REFERENCES public.project_milestones(id) ON DELETE SET NULL,
  linked_revision_id uuid NULL REFERENCES public.milestone_budget_revisions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_milestone_revisions_milestone ON public.milestone_budget_revisions(milestone_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_milestone_revisions_project ON public.milestone_budget_revisions(project_id, created_at DESC);

ALTER TABLE public.milestone_budget_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project members can view milestone revisions" ON public.milestone_budget_revisions;
CREATE POLICY "Project members can view milestone revisions"
ON public.milestone_budget_revisions
FOR SELECT
TO authenticated
USING (public.is_project_member(project_id, auth.uid()));

DROP POLICY IF EXISTS "Project members can insert milestone revisions" ON public.milestone_budget_revisions;
CREATE POLICY "Project members can insert milestone revisions"
ON public.milestone_budget_revisions
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_project_member(project_id, auth.uid())
  AND user_id = auth.uid()
);

DROP POLICY IF EXISTS "Project owner can delete milestone revisions" ON public.milestone_budget_revisions;
CREATE POLICY "Project owner can delete milestone revisions"
ON public.milestone_budget_revisions
FOR DELETE
TO authenticated
USING (public.is_project_owner(project_id, auth.uid()));