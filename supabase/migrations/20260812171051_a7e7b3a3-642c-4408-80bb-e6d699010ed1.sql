ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS bank_raw_line text,
  ADD COLUMN IF NOT EXISTS bank_raw_line_source text;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_bank_raw_line_source_chk
  CHECK (bank_raw_line_source IS NULL OR bank_raw_line_source IN ('text','html','ai'));

COMMENT ON COLUMN public.expenses.bank_raw_line IS 'Doslovni redak s bankovnog izvoda (max ~300 znakova). Puni ISKLJUCIVO uvoz, nikad korisnik.';
COMMENT ON COLUMN public.expenses.bank_raw_line_source IS 'Porijeklo citata: text (PDF tekstualni sloj), html (tablica), ai (prepis citaca kod skena).';