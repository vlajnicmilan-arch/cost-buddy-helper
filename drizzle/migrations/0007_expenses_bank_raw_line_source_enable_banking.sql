ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_bank_raw_line_source_chk;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_bank_raw_line_source_chk
  CHECK (
    bank_raw_line_source IS NULL
    OR bank_raw_line_source = ANY (ARRAY['text'::text, 'html'::text, 'ai'::text, 'enable_banking'::text])
  );