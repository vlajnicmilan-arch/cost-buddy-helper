-- Ensure service_role has full DML on the exact smoke seed write-set.
-- Historical migrations for public.projects and public.expenses did not include
-- explicit GRANTs, so PostgREST/pg denies writes even for service_role in fresh
-- local stress-smoke bootstraps. This adds the missing GRANTs only; no RLS,
-- schema, or app-semantic changes.
GRANT ALL ON public.projects TO service_role;
GRANT ALL ON public.expenses TO service_role;