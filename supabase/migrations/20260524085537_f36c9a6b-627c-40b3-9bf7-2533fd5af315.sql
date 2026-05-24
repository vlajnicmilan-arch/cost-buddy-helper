-- Rollback lažnih bank-match podataka iz backfill_import_fingerprints()
UPDATE public.expenses
   SET bank_transaction_id = NULL,
       import_batch_id     = NULL,
       bank_match_status   = 'manual'
 WHERE bank_transaction_id LIKE 'imp:%';

DELETE FROM public.imported_statements
 WHERE file_name = '[legacy backfill]';

DROP FUNCTION IF EXISTS public.backfill_import_fingerprints();