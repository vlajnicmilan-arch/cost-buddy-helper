-- In-app feedback submissions (Bug/Idea/Question) with auto-attached diagnostics
CREATE TABLE public.feedback_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NULL,
  email TEXT NULL,
  type TEXT NOT NULL CHECK (type IN ('bug', 'idea', 'question')),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000),
  rating SMALLINT NULL CHECK (rating BETWEEN 1 AND 5),
  -- Diagnostics auto-attached (opt-in toggleable in UI)
  route TEXT NULL,
  app_version TEXT NULL,
  user_agent TEXT NULL,
  language TEXT NULL,
  viewport TEXT NULL,
  platform TEXT NULL,
  console_tail JSONB NULL,
  diagnostics JSONB NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_submissions_user ON public.feedback_submissions(user_id);
CREATE INDEX idx_feedback_submissions_created ON public.feedback_submissions(created_at DESC);
CREATE INDEX idx_feedback_submissions_type ON public.feedback_submissions(type);

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can submit feedback
CREATE POLICY "Anyone can submit feedback"
ON public.feedback_submissions
FOR INSERT
TO anon, authenticated
WITH CHECK (
  -- If user_id is provided, it must match the authenticated user
  (user_id IS NULL) OR (auth.uid() = user_id)
);

-- Users can read their own feedback
CREATE POLICY "Users can read own feedback"
ON public.feedback_submissions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can read all feedback
CREATE POLICY "Admins can read all feedback"
ON public.feedback_submissions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update feedback (status changes, triage)
CREATE POLICY "Admins can update feedback"
ON public.feedback_submissions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can delete feedback
CREATE POLICY "Admins can delete feedback"
ON public.feedback_submissions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Auto-update updated_at
CREATE TRIGGER update_feedback_submissions_updated_at
BEFORE UPDATE ON public.feedback_submissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();