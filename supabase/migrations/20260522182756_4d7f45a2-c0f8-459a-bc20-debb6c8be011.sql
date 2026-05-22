CREATE OR REPLACE FUNCTION public.backfill_import_fingerprints()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_fp_count int := 0;
  v_batch_synth int := 0;
  v_statements_count int := 0;
BEGIN
  WITH base AS (
    SELECT
      e.id,
      e.user_id,
      COALESCE(e.payment_source, '') AS src,
      to_char(e.date, 'YYYY-MM-DD') AS d,
      COALESCE(e.type, '') AS t,
      trim(to_char(e.amount, 'FM999999999990.00')) AS amt,
      NULLIF(
        trim(regexp_replace(lower(public.unaccent(coalesce(e.description, ''))), '\s+', ' ', 'g')),
        ''
      ) AS desc_norm,
      trim(regexp_replace(lower(public.unaccent(coalesce(e.merchant_name, ''))), '\s+', ' ', 'g')) AS merch_norm
    FROM public.expenses e
    WHERE e.bank_transaction_id IS NULL
      AND e.deleted_at IS NULL
      AND e.payment_source IS NOT NULL
      AND e.date IS NOT NULL
      AND e.amount IS NOT NULL
  ),
  hashed AS (
    SELECT
      id, user_id,
      'imp:' || encode(
        extensions.digest(
          (user_id::text || '|' || src || '|' || d || '|' || t || '|' || amt || '|' ||
            COALESCE(desc_norm, merch_norm))::bytea,
          'sha256'
        ),
        'hex'
      ) AS fp_base
    FROM base
  ),
  existing AS (
    SELECT user_id, bank_transaction_id AS fp
    FROM public.expenses
    WHERE bank_transaction_id IS NOT NULL
  ),
  ranked AS (
    SELECT
      h.id, h.user_id, h.fp_base,
      ROW_NUMBER() OVER (PARTITION BY h.user_id, h.fp_base ORDER BY h.id) AS rn,
      (SELECT count(*) FROM existing ex
        WHERE ex.user_id = h.user_id AND ex.fp LIKE h.fp_base || '%') AS prior
    FROM hashed h
  ),
  upd AS (
    UPDATE public.expenses e
       SET bank_transaction_id = CASE
         WHEN r.rn + r.prior = 1 THEN r.fp_base
         ELSE r.fp_base || ':dup:' || (r.rn + r.prior)::text
       END
      FROM ranked r
     WHERE e.id = r.id
       AND e.bank_transaction_id IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_fp_count FROM upd;

  WITH groups AS (
    SELECT DISTINCT
      user_id,
      payment_source,
      to_char(date, 'YYYY-MM') AS ym
    FROM public.expenses
    WHERE import_batch_id IS NULL
      AND bank_transaction_id IS NOT NULL
      AND deleted_at IS NULL
      AND payment_source IS NOT NULL
  ),
  with_id AS (
    SELECT user_id, payment_source, ym, gen_random_uuid() AS new_batch
    FROM groups
  ),
  upd2 AS (
    UPDATE public.expenses e
       SET import_batch_id = w.new_batch
      FROM with_id w
     WHERE e.user_id = w.user_id
       AND e.payment_source = w.payment_source
       AND to_char(e.date, 'YYYY-MM') = w.ym
       AND e.import_batch_id IS NULL
       AND e.bank_transaction_id IS NOT NULL
       AND e.deleted_at IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_batch_synth FROM upd2;

  WITH groups AS (
    SELECT
      e.user_id,
      e.payment_source,
      e.import_batch_id,
      MIN(e.date)::timestamptz AS imported_at,
      COUNT(*) AS cnt,
      encode(
        extensions.digest(
          string_agg(e.bank_transaction_id, '|' ORDER BY e.bank_transaction_id)::bytea,
          'sha256'
        ),
        'hex'
      ) AS content_hash
    FROM public.expenses e
    WHERE e.import_batch_id IS NOT NULL
      AND e.bank_transaction_id IS NOT NULL
      AND e.deleted_at IS NULL
    GROUP BY e.user_id, e.payment_source, e.import_batch_id
  ),
  src_uuid AS (
    SELECT
      g.*,
      CASE
        WHEN g.payment_source LIKE 'custom:%' THEN substring(g.payment_source FROM 8)::uuid
        WHEN g.payment_source ~ '^[0-9a-f-]{36}$' THEN g.payment_source::uuid
        ELSE NULL
      END AS payment_source_id
    FROM groups g
  ),
  ins AS (
    INSERT INTO public.imported_statements
      (user_id, payment_source_id, content_hash, file_hash,
       file_name, file_size, mime_type, transactions_count,
       import_batch_id, imported_at)
    SELECT
      s.user_id, s.payment_source_id, s.content_hash, NULL,
      '[legacy backfill]', NULL, NULL, s.cnt,
      s.import_batch_id, s.imported_at
    FROM src_uuid s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.imported_statements ix
      WHERE ix.user_id = s.user_id
        AND (ix.content_hash = s.content_hash OR ix.import_batch_id = s.import_batch_id)
    )
    RETURNING 1
  )
  SELECT count(*) INTO v_statements_count FROM ins;

  RETURN jsonb_build_object(
    'fingerprints_added', v_fp_count,
    'synthetic_batches_added', v_batch_synth,
    'statements_recorded', v_statements_count
  );
END;
$$;

SELECT public.backfill_import_fingerprints();