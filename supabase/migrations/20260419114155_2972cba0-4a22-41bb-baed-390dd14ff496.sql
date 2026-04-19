-- Backfill: postavi kategoriju 'transfer' na sve postojeće prijenose
UPDATE public.expenses 
SET category = 'transfer', updated_at = now()
WHERE type = 'transfer' AND category != 'transfer';