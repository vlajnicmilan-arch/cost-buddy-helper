-- 1) imported_statements table
CREATE TABLE IF NOT EXISTS public.imported_statements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  payment_source_id UUID NULL,
  file_hash TEXT NULL,
  content_hash TEXT NULL,
  file_name TEXT NULL,
  file_size BIGINT NULL,
  mime_type TEXT NULL,
  transactions_count INTEGER NULL,
  import_batch_id UUID NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_imported_statements_user_filehash
  ON public.imported_statements (user_id, file_hash)
  WHERE file_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_imported_statements_user_contenthash
  ON public.imported_statements (user_id, content_hash)
  WHERE content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_imported_statements_user_imported_at
  ON public.imported_statements (user_id, imported_at DESC);

ALTER TABLE public.imported_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own imported statements" ON public.imported_statements;
CREATE POLICY "Users select own imported statements"
  ON public.imported_statements FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own imported statements" ON public.imported_statements;
CREATE POLICY "Users insert own imported statements"
  ON public.imported_statements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own imported statements" ON public.imported_statements;
CREATE POLICY "Users delete own imported statements"
  ON public.imported_statements FOR DELETE
  USING (auth.uid() = user_id);

-- 2) Backfill content_hash from existing import batches.
-- Pseudo-content-hash = SHA-256(concat of sorted bank_transaction_id rows in batch).
-- Browser computes the same hash for re-uploads using the post-parse content_hash formula?
-- NOTE: For backfilled rows, the frontend cannot reproduce this exact hash from a fresh parse.
-- Instead, the frontend will compute its own content_hash on re-upload AND we also insert
-- a backfill row keyed by sorted-fingerprint-set so per-batch dedupe works for rows that
-- already share bank_transaction_id values. The row-level dedup in importFromCSV remains the
-- final defense for backfilled batches.
INSERT INTO public.imported_statements (
  user_id, payment_source_id, file_hash, content_hash,
  transactions_count, import_batch_id, imported_at
)
SELECT
  e.user_id,
  NULL::uuid AS payment_source_id,
  NULL AS file_hash,
  encode(
    digest(
      string_agg(e.bank_transaction_id, '|' ORDER BY e.bank_transaction_id),
      'sha256'
    ),
    'hex'
  ) AS content_hash,
  COUNT(*)::int AS transactions_count,
  e.import_batch_id,
  MIN(e.created_at) AS imported_at
FROM public.expenses e
WHERE e.import_batch_id IS NOT NULL
  AND e.bank_transaction_id IS NOT NULL
  AND e.deleted_at IS NULL
GROUP BY e.user_id, e.import_batch_id
ON CONFLICT DO NOTHING;