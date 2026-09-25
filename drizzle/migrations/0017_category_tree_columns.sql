-- Nalog 3 (kategorije): aditivni stupci, bez backfilla, bez izmjene postojećih vrijednosti.
ALTER TABLE public.custom_categories
  ADD COLUMN IF NOT EXISTS group_key text NULL;
ALTER TABLE public.custom_categories
  ADD CONSTRAINT custom_categories_group_key_check
  CHECK (group_key IS NULL OR group_key IN
    ('cafes','food','car','travel','work','home','loans','fees_taxes','personal','fun','other','income'));

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_tags_check
  CHECK (tags <@ ARRAY['unnecessary','luxury']::text[]);

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS movement_kind text NULL;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_movement_kind_check
  CHECK (movement_kind IS NULL OR movement_kind IN
    ('own_transfer','atm','loan_given','loan_repaid_to_me','loan_received','loan_repaid_by_me','own_company_payment'));

COMMENT ON COLUMN public.custom_categories.group_key IS 'Skupina iz categoryTree registra; NULL = Moje kategorije.';
COMMENT ON COLUMN public.expenses.tags IS 'Oznake: unnecessary, luxury (sučelje: nalog 4).';
COMMENT ON COLUMN public.expenses.movement_kind IS 'Vrsta kretanja novca; ne-NULL isključuje iz potrošnje/prihoda (isRealSpend).';