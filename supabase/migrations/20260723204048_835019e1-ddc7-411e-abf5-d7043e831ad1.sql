
-- 1) AI proposed actions (draft writes awaiting user confirmation)
CREATE TABLE IF NOT EXISTS public.ai_proposed_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text,
  action_type text NOT NULL,
  summary text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','rejected','expired')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  rejected_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_ai_proposed_actions_user ON public.ai_proposed_actions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_proposed_actions_status ON public.ai_proposed_actions(status);

GRANT SELECT, INSERT, UPDATE ON public.ai_proposed_actions TO authenticated;
GRANT ALL ON public.ai_proposed_actions TO service_role;

ALTER TABLE public.ai_proposed_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_proposed_actions owner select"
  ON public.ai_proposed_actions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "ai_proposed_actions owner insert"
  ON public.ai_proposed_actions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ai_proposed_actions owner update"
  ON public.ai_proposed_actions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2) AI action log (audit trail of confirmed/rejected + memory events)
CREATE TABLE IF NOT EXISTS public.ai_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposal_id uuid REFERENCES public.ai_proposed_actions(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('confirmed','rejected','expired','executed_direct')),
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_action_log_user ON public.ai_action_log(user_id, created_at DESC);

GRANT SELECT ON public.ai_action_log TO authenticated;
GRANT ALL ON public.ai_action_log TO service_role;

ALTER TABLE public.ai_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_action_log owner select"
  ON public.ai_action_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
