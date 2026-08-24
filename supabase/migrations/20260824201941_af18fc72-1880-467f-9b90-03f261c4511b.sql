ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_bank_match_status_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_bank_match_status_check
  CHECK (bank_match_status = ANY (ARRAY['manual'::text,'pending_bank'::text,'confirmed'::text,'bank_only'::text,'merged_into_manual'::text]));