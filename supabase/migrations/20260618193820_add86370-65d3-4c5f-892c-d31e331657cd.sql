-- Val 3: regex-only anti-regression CHECK constraint on expenses.payment_source.
-- Allows:
--   - NULL (one existing row)
--   - custom:UUID (canonical custom payment source, including 5 pre-existing orphans)
--   - snake_case built-in slugs (cash, bank, visa_gold, ...)
-- Blocks:
--   - raw UUID without custom: prefix
--   - empty string
--   - mixed-case, whitespace, free-text
-- Pre-flight validation showed 0 rows would fail (of 2181 total).
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_payment_source_canonical_check
  CHECK (
    payment_source IS NULL
    OR payment_source ~ '^(custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z][a-z0-9_]*)$'
  );