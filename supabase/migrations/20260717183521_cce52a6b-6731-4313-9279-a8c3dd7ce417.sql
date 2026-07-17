
-- ============================================================
-- READ-ONLY POLICY — FAZA A (dio 1)
-- Free tier brojač + serverske brave za transakcije/sources/budgets
-- ============================================================

-- 1) TABLICA: free_tier_usage_monthly (increment-only counter)
CREATE TABLE IF NOT EXISTS public.free_tier_usage_monthly (
  user_id UUID NOT NULL,
  month_key TEXT NOT NULL,                       -- 'YYYY-MM' po datumu transakcije
  transactions_created INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month_key)
);

GRANT SELECT ON public.free_tier_usage_monthly TO authenticated;
GRANT ALL ON public.free_tier_usage_monthly TO service_role;

ALTER TABLE public.free_tier_usage_monthly ENABLE ROW LEVEL SECURITY;

-- Samo vlastiti red, samo SELECT iz klijenta
CREATE POLICY "Users read own free tier usage"
  ON public.free_tier_usage_monthly
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
-- Nema INSERT/UPDATE/DELETE policy — samo SECURITY DEFINER trigger može pisati

CREATE INDEX IF NOT EXISTS idx_free_tier_usage_user_month
  ON public.free_tier_usage_monthly(user_id, month_key);

-- 2) HELPER: month_key iz datuma
CREATE OR REPLACE FUNCTION public.month_key_from_date(_d DATE)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT to_char(_d, 'YYYY-MM')
$$;

-- 3) TRIGGER: AFTER INSERT expenses -> increment counter
-- Broji samo "prave" korisničke unose (regular / NULL nature), ne korekcije.
-- Broji po vlasniku (user_id), tako da član grupe koji unosi u tuđi izvor
-- ne "troši" Free limit vlasniku.
CREATE OR REPLACE FUNCTION public.increment_free_tier_counter()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mk TEXT;
BEGIN
  -- Preskoči korekcije i izvanredne
  IF NEW.expense_nature IS NOT NULL
     AND NEW.expense_nature NOT IN ('regular') THEN
    RETURN NEW;
  END IF;

  -- Preskoči zapise koje je drugi član napravio u tuđem izvoru
  IF NEW.submitted_by IS NOT NULL AND NEW.submitted_by <> NEW.user_id THEN
    RETURN NEW;
  END IF;

  _mk := to_char(COALESCE(NEW.date, CURRENT_DATE), 'YYYY-MM');

  INSERT INTO public.free_tier_usage_monthly(user_id, month_key, transactions_created)
  VALUES (NEW.user_id, _mk, 1)
  ON CONFLICT (user_id, month_key)
  DO UPDATE SET
    transactions_created = public.free_tier_usage_monthly.transactions_created + 1,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_increment_free_counter ON public.expenses;
CREATE TRIGGER trg_expenses_increment_free_counter
  AFTER INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.increment_free_tier_counter();

-- 4) TRIGGER: BEFORE INSERT expenses -> enforce free cap
-- Ako korisnik nema 'smjer' entitlement i mjesečni brojač ≥ 30 → RAISE.
-- Pretplatnici prolaze bez provjere.
CREATE OR REPLACE FUNCTION public.enforce_free_transaction_cap()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mk TEXT;
  _count INT;
BEGIN
  -- Ne broji korekcije/izvanredne, i ne broji tuđe unose u vlastiti source
  IF NEW.expense_nature IS NOT NULL
     AND NEW.expense_nature NOT IN ('regular') THEN
    RETURN NEW;
  END IF;
  IF NEW.submitted_by IS NOT NULL AND NEW.submitted_by <> NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Pretplatnici prolaze
  IF public.has_entitlement(NEW.user_id, 'smjer') THEN
    RETURN NEW;
  END IF;

  _mk := to_char(COALESCE(NEW.date, CURRENT_DATE), 'YYYY-MM');
  SELECT COALESCE(transactions_created, 0)
    INTO _count
    FROM public.free_tier_usage_monthly
    WHERE user_id = NEW.user_id AND month_key = _mk;

  IF COALESCE(_count, 0) >= 30 THEN
    RAISE EXCEPTION 'free_limit_exceeded: transactions %/30 for month %', _count, _mk
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_enforce_free_cap ON public.expenses;
CREATE TRIGGER trg_expenses_enforce_free_cap
  BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_free_transaction_cap();

-- 5) TRIGGER: BEFORE INSERT custom_payment_sources -> enforce free cap (max 1)
CREATE OR REPLACE FUNCTION public.enforce_free_payment_source_cap()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count INT;
BEGIN
  IF public.has_entitlement(NEW.user_id, 'smjer') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO _count
  FROM public.custom_payment_sources
  WHERE user_id = NEW.user_id;

  IF _count >= 1 THEN
    RAISE EXCEPTION 'free_limit_exceeded: payment_sources %/1', _count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_sources_enforce_free_cap ON public.custom_payment_sources;
CREATE TRIGGER trg_payment_sources_enforce_free_cap
  BEFORE INSERT ON public.custom_payment_sources
  FOR EACH ROW EXECUTE FUNCTION public.enforce_free_payment_source_cap();

-- 6) TRIGGER: BEFORE INSERT budget_plans -> enforce free cap (max 1)
CREATE OR REPLACE FUNCTION public.enforce_free_budget_cap()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count INT;
BEGIN
  IF public.has_entitlement(NEW.user_id, 'smjer') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO _count
  FROM public.budget_plans
  WHERE user_id = NEW.user_id;

  IF _count >= 1 THEN
    RAISE EXCEPTION 'free_limit_exceeded: budgets %/1', _count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_budget_plans_enforce_free_cap ON public.budget_plans;
CREATE TRIGGER trg_budget_plans_enforce_free_cap
  BEFORE INSERT ON public.budget_plans
  FOR EACH ROW EXECUTE FUNCTION public.enforce_free_budget_cap();

-- 7) BACKFILL: popuni brojač za tekući mjesec iz postojećih expenses
-- Broji samo regular/NULL nature i vlastite unose (submitted_by = user_id ili NULL)
INSERT INTO public.free_tier_usage_monthly(user_id, month_key, transactions_created)
SELECT
  e.user_id,
  to_char(COALESCE(e.date, e.created_at::date), 'YYYY-MM') AS mk,
  COUNT(*) AS cnt
FROM public.expenses e
WHERE (e.expense_nature IS NULL OR e.expense_nature = 'regular')
  AND (e.submitted_by IS NULL OR e.submitted_by = e.user_id)
  AND to_char(COALESCE(e.date, e.created_at::date), 'YYYY-MM') = to_char(CURRENT_DATE, 'YYYY-MM')
GROUP BY e.user_id, mk
ON CONFLICT (user_id, month_key) DO NOTHING;

-- 8) HELPER RPC koji klijent poziva za "trenutni brojač"
CREATE OR REPLACE FUNCTION public.get_free_tier_usage_current_month(_user_id UUID DEFAULT NULL)
RETURNS TABLE(transactions_created INT, month_key TEXT, transactions_limit INT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(u.transactions_created, 0) AS transactions_created,
    to_char(CURRENT_DATE, 'YYYY-MM') AS month_key,
    30 AS transactions_limit
  FROM (SELECT 1) x
  LEFT JOIN public.free_tier_usage_monthly u
    ON u.user_id = COALESCE(_user_id, auth.uid())
   AND u.month_key = to_char(CURRENT_DATE, 'YYYY-MM')
$$;

GRANT EXECUTE ON FUNCTION public.get_free_tier_usage_current_month(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_free_tier_usage_current_month(UUID) FROM anon;

REVOKE EXECUTE ON FUNCTION public.increment_free_tier_counter() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_free_transaction_cap() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_free_payment_source_cap() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_free_budget_cap() FROM anon, authenticated;
