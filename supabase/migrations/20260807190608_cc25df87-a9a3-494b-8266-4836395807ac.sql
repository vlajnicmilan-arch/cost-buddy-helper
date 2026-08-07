ALTER TABLE public.import_transfer_rules
  ADD COLUMN direction text NOT NULL DEFAULT 'out';

ALTER TABLE public.import_transfer_rules
  ALTER COLUMN direction DROP DEFAULT;

ALTER TABLE public.import_transfer_rules
  ADD CONSTRAINT import_transfer_rules_direction_check
  CHECK (direction IN ('in', 'out'));

ALTER TABLE public.import_transfer_rules
  DROP CONSTRAINT IF EXISTS import_transfer_rules_unique_key;

ALTER TABLE public.import_transfer_rules
  ADD CONSTRAINT import_transfer_rules_unique_key
  UNIQUE (user_id, merchant_key, source_wallet_key, direction);