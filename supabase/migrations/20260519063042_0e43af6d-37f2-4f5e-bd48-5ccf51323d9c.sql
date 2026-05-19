CREATE TABLE IF NOT EXISTS public.pdf_parse_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pdf_parse_jobs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pdf_parse_jobs_user_created ON public.pdf_parse_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdf_parse_jobs_status_created ON public.pdf_parse_jobs (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_pdf_parse_jobs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_pdf_parse_jobs_updated_at ON public.pdf_parse_jobs;
CREATE TRIGGER update_pdf_parse_jobs_updated_at
BEFORE UPDATE ON public.pdf_parse_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_pdf_parse_jobs_updated_at();

DROP POLICY IF EXISTS "Users can view their own PDF parse jobs" ON public.pdf_parse_jobs;
CREATE POLICY "Users can view their own PDF parse jobs"
ON public.pdf_parse_jobs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own PDF parse jobs" ON public.pdf_parse_jobs;
CREATE POLICY "Users can create their own PDF parse jobs"
ON public.pdf_parse_jobs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove their own PDF parse jobs" ON public.pdf_parse_jobs;
CREATE POLICY "Users can remove their own PDF parse jobs"
ON public.pdf_parse_jobs
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);