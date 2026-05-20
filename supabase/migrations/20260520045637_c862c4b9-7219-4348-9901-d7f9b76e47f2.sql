
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

DO $$
DECLARE
  v_deleted INT := 0;
  v_backfilled INT := 0;
BEGIN
  -- 1) Compute candidate fingerprints for NULL rows
  CREATE TEMP TABLE _fp_candidates AS
  SELECT e.id, e.user_id, e.payment_source, e.amount, e.type, e.created_at,
         'imp:' || encode(extensions.digest(
           e.user_id::text || '|' ||
           COALESCE(e.payment_source,'') || '|' ||
           to_char(e.date AT TIME ZONE 'UTC', 'YYYY-MM-DD') || '|' ||
           COALESCE(e.type::text,'') || '|' ||
           to_char(e.amount, 'FM9999999990.00') || '|' ||
           trim(regexp_replace(lower(unaccent(COALESCE(NULLIF(e.description,''), e.merchant_name, ''))), '\s+', ' ', 'g'))
         , 'sha256'), 'hex') AS fp
  FROM public.expenses e
  WHERE e.import_batch_id IS NOT NULL
    AND e.bank_transaction_id IS NULL;

  -- 2) Build unified list (old NULL rows + already-fingerprinted rows) per (user_id, fp)
  CREATE TEMP TABLE _all_fp AS
  SELECT id, user_id, fp, payment_source, amount, type, created_at FROM _fp_candidates
  UNION ALL
  SELECT e.id, e.user_id, e.bank_transaction_id AS fp, e.payment_source, e.amount, e.type, e.created_at
  FROM public.expenses e
  WHERE e.bank_transaction_id LIKE 'imp:%';

  -- 3) Rank: keep oldest per (user_id, fp); the rest are duplicates to delete
  CREATE TEMP TABLE _to_delete AS
  SELECT id, user_id, payment_source, amount, type
  FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id, fp ORDER BY created_at ASC, id ASC) AS rn
    FROM _all_fp
  ) x
  WHERE rn > 1;

  -- 4) Reverse balance impact on custom_payment_sources for each deleted row
  --    expense -> add back; income/transfer -> subtract
  UPDATE public.custom_payment_sources cps
  SET balance = cps.balance + d.delta,
      updated_at = now()
  FROM (
    SELECT REPLACE(payment_source, 'custom:', '')::uuid AS source_id,
           SUM(CASE
             WHEN type = 'expense' THEN amount
             WHEN type IN ('income','transfer') THEN -amount
             ELSE 0
           END) AS delta
    FROM _to_delete
    WHERE payment_source LIKE 'custom:%'
    GROUP BY 1
  ) d
  WHERE cps.id = d.source_id;

  -- 5) Hard-delete duplicates
  DELETE FROM public.expenses e USING _to_delete d WHERE e.id = d.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 6) Backfill fingerprints on remaining (kept) NULL rows
  UPDATE public.expenses e
  SET bank_transaction_id = c.fp
  FROM _fp_candidates c
  WHERE e.id = c.id
    AND e.bank_transaction_id IS NULL;
  GET DIAGNOSTICS v_backfilled = ROW_COUNT;

  RAISE NOTICE 'Cleanup done: deleted=%, backfilled=%', v_deleted, v_backfilled;

  DROP TABLE _fp_candidates;
  DROP TABLE _all_fp;
  DROP TABLE _to_delete;
END $$;
