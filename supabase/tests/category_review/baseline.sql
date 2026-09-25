-- Pregled kategorija: dodaci na podlogu salda (balance bootstrap/baseline + migracije).
-- Oblik tablica prema živoj bazi (samo stupci koje funkcije čitaju).
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS merchant_name text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS movement_kind text NULL;
DO $$ BEGIN
  ALTER TABLE public.expenses ADD CONSTRAINT expenses_tags_check CHECK (tags <@ ARRAY['unnecessary','luxury']::text[]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.expenses ADD CONSTRAINT expenses_movement_kind_check CHECK (movement_kind IS NULL OR movement_kind IN
    ('own_transfer','atm','loan_given','loan_repaid_to_me','loan_received','loan_repaid_by_me','own_company_payment'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE public.expenses SET category = 'other' WHERE category IS NULL;
ALTER TABLE public.expenses ALTER COLUMN category SET DEFAULT 'other';
ALTER TABLE public.expenses ALTER COLUMN category SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.custom_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, name text NOT NULL,
  icon text NOT NULL DEFAULT '📦', color text NOT NULL DEFAULT '#000', group_key text);

CREATE TABLE IF NOT EXISTS public.category_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, expense_id uuid,
  original_category text NOT NULL, original_origin text, corrected_category text NOT NULL,
  description text, merchant_name text, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS public.payment_source_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_source_id uuid NOT NULL REFERENCES public.custom_payment_sources(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, role text NOT NULL);

CREATE OR REPLACE FUNCTION public.can_write_payment_source(_source_id uuid, _user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.custom_payment_sources WHERE id = _source_id AND user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.payment_source_members
                 WHERE payment_source_id = _source_id AND user_id = _user_id AND role IN ('full','limited','member'));
$function$;

-- Fiksni svijet: A (vlasnik), B (tuđi), C (član dijeljenog izvora s pravom pisanja).
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','cr.a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002','cr.b@test.local'),
  ('cccccccc-0000-0000-0000-000000000003','cr.c@test.local')
ON CONFLICT DO NOTHING;
INSERT INTO public.custom_payment_sources (id, user_id, name, balance) VALUES
  ('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','A račun',0),
  ('22222222-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','B račun',0);
INSERT INTO public.payment_source_members (payment_source_id, user_id, role) VALUES
  ('11111111-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000003','full');
INSERT INTO public.custom_categories (id, user_id, name) VALUES
  ('ab61e917-645c-465c-94f4-aec2645062e9','aaaaaaaa-0000-0000-0000-000000000001','Pokrivanje drugih pizdarija'),
  ('dddddddd-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','Moja'),
  ('eeeeeeee-0000-0000-0000-000000000005','bbbbbbbb-0000-0000-0000-000000000002','Tuđa');
INSERT INTO public.expenses (id, user_id, type, amount, payment_source, category, description, merchant_name) VALUES
  ('e0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','expense',30,'custom:11111111-0000-0000-0000-000000000001','food','Konzum','Konzum'),
  ('e0000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','expense',50,'custom:11111111-0000-0000-0000-000000000001','other','Aircash','Aircash'),
  ('e0000000-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','expense',7,'custom:11111111-0000-0000-0000-000000000001','ab61e917-645c-465c-94f4-aec2645062e9','x',null),
  ('e0000000-0000-0000-0000-000000000004','bbbbbbbb-0000-0000-0000-000000000002','expense',9,'custom:22222222-0000-0000-0000-000000000002','other','B trgovina',null),
  ('e0000000-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000001','income',200,'custom:11111111-0000-0000-0000-000000000001','other','Plaća',null);
