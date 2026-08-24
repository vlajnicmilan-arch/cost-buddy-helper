-- V2 ključ uvoza, dopuna: TIP izlazi iz ključa.
-- Identitet retka: user_id | payment_source | datum(UTC) | iznos | saldo.
-- Parametar p_type zadržan radi kompatibilnosti potpisa, ali se NE hashira.
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
        || '|' || to_char(p_amount, 'FM9999999999990.00')
        || '|bal:' || to_char(p_balance_after, 'FM9999999999990.00'),
      'sha256'), 'hex')
  END
$$;

-- Preračun: uvezeni redci sa saldom (stari 'imp:' i prijašnji 'imp2:'),
-- jedan redak po ključu, sudari ostaju na starom ključu, ništa se ne briše.
WITH cand AS (
  SELECT e.id,
         e.user_id,
         public.import_key_v2(e.user_id, e.payment_source, e.date, e.type::text, e.amount, e.balance_after) AS new_key,
         e.bank_transaction_id AS old_key,
         e.deleted_at,
         e.created_at
  FROM public.expenses e
  WHERE (e.bank_transaction_id LIKE 'imp:%' OR e.bank_transaction_id LIKE 'imp2:%')
    AND e.balance_after IS NOT NULL
), picked AS (
  SELECT DISTINCT ON (user_id, new_key) id, user_id, new_key
  FROM cand
  WHERE new_key IS NOT NULL AND new_key IS DISTINCT FROM old_key
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