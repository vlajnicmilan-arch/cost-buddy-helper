CREATE OR REPLACE FUNCTION public.enforce_free_transaction_cap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF public.has_any_paid_plan(NEW.user_id) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.enforce_free_payment_source_cap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _count INT;
BEGIN
  IF public.has_any_paid_plan(NEW.user_id) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.enforce_free_budget_cap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _count INT;
BEGIN
  IF public.has_any_paid_plan(NEW.user_id) THEN
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
$function$;