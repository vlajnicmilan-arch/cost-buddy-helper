
CREATE TABLE public.milestone_budget_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  milestone_id UUID NOT NULL REFERENCES public.project_milestones(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  threshold INTEGER NOT NULL CHECK (threshold IN (80, 100)),
  usage_pct NUMERIC NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (milestone_id, threshold, user_id)
);

CREATE INDEX idx_milestone_budget_alerts_milestone ON public.milestone_budget_alerts(milestone_id);
CREATE INDEX idx_milestone_budget_alerts_user ON public.milestone_budget_alerts(user_id);

ALTER TABLE public.milestone_budget_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own milestone budget alerts"
ON public.milestone_budget_alerts
FOR SELECT
USING (auth.uid() = user_id);
