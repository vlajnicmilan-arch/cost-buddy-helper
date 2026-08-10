ALTER TABLE public.mail_statement_source_map
  ADD COLUMN IF NOT EXISTS account_identifier text;

UPDATE public.mail_statement_source_map
   SET account_identifier = account_iban
 WHERE account_identifier IS NULL;

ALTER TABLE public.mail_statement_source_map
  ALTER COLUMN account_iban DROP NOT NULL;

ALTER TABLE public.mail_statement_source_map
  ALTER COLUMN account_identifier SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mail_statement_source_map_user_identifier_uidx
  ON public.mail_statement_source_map (user_id, account_identifier);