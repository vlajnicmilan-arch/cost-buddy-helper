-- Per-user toggle for hiding payment sources from Dashboard summary/calculations
CREATE TABLE public.dashboard_hidden_sources (
  user_id UUID NOT NULL,
  source_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source_id)
);

CREATE INDEX idx_dashboard_hidden_sources_user ON public.dashboard_hidden_sources(user_id);

ALTER TABLE public.dashboard_hidden_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own hidden sources"
ON public.dashboard_hidden_sources
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own hidden sources"
ON public.dashboard_hidden_sources
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own hidden sources"
ON public.dashboard_hidden_sources
FOR DELETE
USING (auth.uid() = user_id);