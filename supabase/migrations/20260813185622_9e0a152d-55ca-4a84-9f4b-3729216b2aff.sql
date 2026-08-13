ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS owner_funding_choice text;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_owner_funding_choice_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_owner_funding_choice_check
  CHECK (owner_funding_choice IS NULL OR owner_funding_choice IN ('owner_loan', 'material'));

COMMENT ON COLUMN public.expenses.owner_funding_choice IS
  'Odluka korisnika kad je poslovni trosak placen iz osobnog izvora: owner_loan (stvara pozajmicu) ili material (trosak firme bez pozajmice). NULL = nije primjenjivo / staro ponasanje.';