-- Milestone checklist items
CREATE TABLE public.milestone_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  milestone_id UUID NOT NULL REFERENCES public.project_milestones(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  done_at TIMESTAMPTZ,
  done_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_milestone_checklist_milestone ON public.milestone_checklist_items(milestone_id, sort_order);
ALTER TABLE public.milestone_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can view checklist"
ON public.milestone_checklist_items FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.project_milestones m
  WHERE m.id = milestone_checklist_items.milestone_id
    AND public.is_project_member(m.project_id, auth.uid())
));
CREATE POLICY "members can insert checklist"
ON public.milestone_checklist_items FOR INSERT
WITH CHECK (auth.uid() = user_id AND EXISTS (
  SELECT 1 FROM public.project_milestones m
  WHERE m.id = milestone_checklist_items.milestone_id
    AND public.is_project_member(m.project_id, auth.uid())
));
CREATE POLICY "members can update checklist"
ON public.milestone_checklist_items FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.project_milestones m
  WHERE m.id = milestone_checklist_items.milestone_id
    AND public.is_project_member(m.project_id, auth.uid())
));
CREATE POLICY "owner or project owner can delete checklist"
ON public.milestone_checklist_items FOR DELETE
USING (auth.uid() = user_id OR EXISTS (
  SELECT 1 FROM public.project_milestones m
  WHERE m.id = milestone_checklist_items.milestone_id
    AND public.is_project_owner(m.project_id, auth.uid())
));
CREATE TRIGGER trg_checklist_updated BEFORE UPDATE ON public.milestone_checklist_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Project share links (read-only public view)
CREATE TABLE public.project_share_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL,
  show_financials BOOLEAN NOT NULL DEFAULT false,
  show_photos BOOLEAN NOT NULL DEFAULT true,
  show_milestones BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  view_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_share_links_project ON public.project_share_links(project_id);
CREATE INDEX idx_share_links_token ON public.project_share_links(token);
ALTER TABLE public.project_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project owner can manage share links"
ON public.project_share_links FOR ALL
USING (public.is_project_owner(project_id, auth.uid()))
WITH CHECK (public.is_project_owner(project_id, auth.uid()));
CREATE TRIGGER trg_share_links_updated BEFORE UPDATE ON public.project_share_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Project activity log (timeline feed)
CREATE TABLE public.project_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID,
  action_type TEXT NOT NULL,
  action_description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_project_date ON public.project_activity_log(project_id, created_at DESC);
ALTER TABLE public.project_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can view activity"
ON public.project_activity_log FOR SELECT
USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "members can insert activity"
ON public.project_activity_log FOR INSERT
WITH CHECK (auth.uid() = user_id AND public.is_project_member(project_id, auth.uid()));

-- Composite index for archived filter
CREATE INDEX IF NOT EXISTS idx_projects_archived ON public.projects(archived_at) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_work_type ON public.expenses(project_id, work_type) WHERE project_id IS NOT NULL;