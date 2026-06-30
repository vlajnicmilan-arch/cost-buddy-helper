
-- Backfill correction_anchor_date + correction_anchor_balance for NULL anchor sources
-- Source of truth: latest correction row per source (by created_at DESC)
-- anchor_date = correction.created_at
-- anchor_balance = parsed Y from note "Saldo korigiran s X na Y"
-- Skips any source where regex or X/Y/amount/type consistency fails.

WITH latest AS (
  SELECT DISTINCT ON (substring(e.payment_source from 8))
    substring(e.payment_source from 8)::uuid AS source_id,
    e.id AS source_correction_id,
    e.created_at,
    e.note,
    e.amount,
    e.type
  FROM expenses e
  WHERE e.deleted_at IS NULL
    AND e.expense_nature = 'correction'
    AND e.payment_source LIKE 'custom:%'
  ORDER BY substring(e.payment_source from 8), e.created_at DESC
),
parsed AS (
  SELECT
    l.*,
    (regexp_match(l.note, 's (-?\d+(?:\.\d+)?) na (-?\d+(?:\.\d+)?)'))[1]::numeric AS parsed_x,
    (regexp_match(l.note, 's (-?\d+(?:\.\d+)?) na (-?\d+(?:\.\d+)?)'))[2]::numeric AS parsed_y
  FROM latest l
),
eligible AS (
  SELECT p.*
  FROM parsed p
  JOIN custom_payment_sources cps ON cps.id = p.source_id
  WHERE cps.correction_anchor_date IS NULL
    AND p.parsed_x IS NOT NULL
    AND p.parsed_y IS NOT NULL
    AND (
      (p.type = 'expense' AND abs((p.parsed_x - p.amount) - p.parsed_y) <= 0.01)
      OR
      (p.type = 'income'  AND abs((p.parsed_x + p.amount) - p.parsed_y) <= 0.01)
    )
)
UPDATE custom_payment_sources cps
SET correction_anchor_date = e.created_at,
    correction_anchor_balance = e.parsed_y
FROM eligible e
WHERE cps.id = e.source_id;
