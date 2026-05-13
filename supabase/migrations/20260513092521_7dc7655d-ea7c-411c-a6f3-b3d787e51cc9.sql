
CREATE TABLE public.ai_insights_cache (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_on DATE NOT NULL DEFAULT CURRENT_DATE,
  insights JSONB NOT NULL DEFAULT '[]'::jsonb,
  expense_count_at_generation INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'hr',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, generated_on)
);

ALTER TABLE public.ai_insights_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ai_insights_cache"
  ON public.ai_insights_cache FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own ai_insights_cache"
  ON public.ai_insights_cache FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own ai_insights_cache"
  ON public.ai_insights_cache FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own ai_insights_cache"
  ON public.ai_insights_cache FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_ai_insights_cache_updated_at
  BEFORE UPDATE ON public.ai_insights_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_ai_insights_cache_user_date ON public.ai_insights_cache(user_id, generated_on DESC);
