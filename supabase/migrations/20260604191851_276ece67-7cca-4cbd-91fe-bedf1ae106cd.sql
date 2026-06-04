-- T5: Transaction Krug fields (Implementation Sprint v1.1)

CREATE TYPE public.krug_privacy AS ENUM ('personal', 'private', 'shared');
CREATE TYPE public.krug_shared_status AS ENUM ('predlozena', 'potvrdjena', 'nepotvrdjena');

ALTER TABLE public.expenses
  ADD COLUMN krug_id uuid REFERENCES public.krug(id) ON DELETE SET NULL,
  ADD COLUMN krug_privacy public.krug_privacy,
  ADD COLUMN krug_shared_status public.krug_shared_status;

-- Invarijante (CHECK, bez now()):
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_krug_shared_status_implies_shared CHECK (
    krug_shared_status IS NULL
    OR (krug_id IS NOT NULL AND krug_privacy = 'shared'::public.krug_privacy)
  ),
  ADD CONSTRAINT expenses_shared_requires_krug CHECK (
    krug_privacy IS DISTINCT FROM 'shared'::public.krug_privacy
    OR krug_id IS NOT NULL
  ),
  ADD CONSTRAINT expenses_nonshared_status_null CHECK (
    krug_privacy IS NULL
    OR krug_privacy = 'shared'::public.krug_privacy
    OR krug_shared_status IS NULL
  );

CREATE INDEX idx_expenses_krug_status ON public.expenses(krug_id, krug_shared_status) WHERE krug_id IS NOT NULL;
CREATE INDEX idx_expenses_krug_user ON public.expenses(krug_id, user_id) WHERE krug_id IS NOT NULL;
