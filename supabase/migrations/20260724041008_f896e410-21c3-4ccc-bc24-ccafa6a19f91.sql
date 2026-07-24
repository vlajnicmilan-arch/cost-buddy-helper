
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS category_origin text
  CHECK (category_origin IN ('ai_suggested','ai_receipt','habit','user','import','rule'))
  DEFAULT NULL;

UPDATE public.expenses SET category_origin = 'user' WHERE category_origin IS NULL;

ALTER TABLE public.expenses ALTER COLUMN category_origin SET DEFAULT 'user';

CREATE TABLE IF NOT EXISTS public.category_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE CASCADE,
  original_category text NOT NULL,
  original_origin text,
  corrected_category text NOT NULL,
  description text,
  merchant_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.category_corrections TO authenticated;
GRANT ALL ON public.category_corrections TO service_role;

ALTER TABLE public.category_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_corrections_select" ON public.category_corrections
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "own_corrections_insert" ON public.category_corrections
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_category_corrections_user ON public.category_corrections(user_id, created_at DESC);
