-- Korak 1: prvo brisanje bank_only redaka da oslobodimo UNIQUE(user_id, bank_transaction_id)
DELETE FROM public.expenses
WHERE id IN ('832df526-9de1-40c5-8562-a55ec61f8335','97148f4b-f476-4f10-86e5-2b41373ce701')
  AND user_id = '3213303b-6267-4188-8dc9-2bb2a5c3c672'
  AND bank_match_status = 'bank_only';

-- Korak 2: označavanje manualnih kao confirmed + vezivanje na izvod
UPDATE public.expenses
SET bank_match_status = 'confirmed',
    import_batch_id = '985b800a-676f-4c2a-b394-58d78d7776cd',
    bank_transaction_id = 'imp:74a2694a82666946e23c80e95b1b63acf3a898eb88eb77ce01df61bfb0710039'
WHERE id = '7b21b2d9-6255-408e-a2f8-214f78f02e0d'
  AND user_id = '3213303b-6267-4188-8dc9-2bb2a5c3c672'
  AND import_batch_id IS NULL;

UPDATE public.expenses
SET bank_match_status = 'confirmed',
    import_batch_id = '985b800a-676f-4c2a-b394-58d78d7776cd',
    bank_transaction_id = 'imp:041da4a1c4e95374c18834e77a247b360ce8a1e8188156c6d5999d82168e7c56'
WHERE id = '4f1c692e-7d3a-462c-968a-d669a1c93d00'
  AND user_id = '3213303b-6267-4188-8dc9-2bb2a5c3c672'
  AND import_batch_id IS NULL;