ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS contract_value NUMERIC;

COMMENT ON COLUMN public.projects.contract_value IS 'Contracted value with the client (accrual basis). If NULL, total_budget is used as fallback.';