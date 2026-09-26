-- Supabase zadane ovlasti daju authenticated sve na novoj tablici; red smije samo čitati.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.bank_sync_review_queue FROM authenticated;
REVOKE ALL ON public.bank_sync_review_queue FROM anon;
