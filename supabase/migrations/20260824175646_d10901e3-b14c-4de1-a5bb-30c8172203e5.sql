-- V2 ključ uvoza: user_id | payment_source | datum(UTC) | tip | iznos | saldo
-- Reproducira `importKeyCanonicalString` iz src/lib/importFingerprint.ts.
CREATE OR REPLACE FUNCTION public.import_key_v2(
  p_user_id uuid,
  p_payment_source text,
  p_date timestamptz,
  p_type text,
  p_amount numeric,
  p_balance_after numeric
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $$
  SELECT CASE WHEN p_balance_after IS NULL THEN NULL ELSE
    'imp2:' || encode(extensions.digest(
      'v2|' || p_user_id::text
        || '|' || COALESCE(p_payment_source, '')
        || '|' || to_char((p_date AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')
        || '|' || COALESCE(p_type, '')
        || '|' || to_char(p_amount, 'FM9999999999990.00')
        || '|bal:' || to_char(p_balance_after, 'FM9999999999990.00'),
      'sha256'), 'hex')
  END
$$;

-- Preračun postojećih redaka: samo uvezeni redci sa saldom, jedan po ključu.
WITH cand AS (
  SELECT e.id,
         e.user_id,
         public.import_key_v2(e.user_id, e.payment_source, e.date, e.type::text, e.amount, e.balance_after) AS new_key,
         e.deleted_at,
         e.created_at
  FROM public.expenses e
  WHERE e.bank_transaction_id LIKE 'imp:%'
    AND e.balance_after IS NOT NULL
), picked AS (
  SELECT DISTINCT ON (user_id, new_key) id, user_id, new_key
  FROM cand
  WHERE new_key IS NOT NULL
  ORDER BY user_id, new_key, (deleted_at IS NULL) DESC, created_at ASC
)
UPDATE public.expenses e
   SET bank_transaction_id = p.new_key
  FROM picked p
 WHERE e.id = p.id
   AND NOT EXISTS (
     SELECT 1 FROM public.expenses x
      WHERE x.user_id = p.user_id
        AND x.bank_transaction_id = p.new_key
        AND x.id <> p.id
   );