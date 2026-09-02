DROP TRIGGER IF EXISTS trg_payment_sources_enforce_free_cap ON public.custom_payment_sources;
DROP TRIGGER IF EXISTS trg_budget_plans_enforce_free_cap ON public.budget_plans;
DROP FUNCTION IF EXISTS public.enforce_free_payment_source_cap();
DROP FUNCTION IF EXISTS public.enforce_free_budget_cap();