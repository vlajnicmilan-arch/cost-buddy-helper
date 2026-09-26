-- Snimka odgovora vlasnika i punopravnog PRIJE migracije (više valuta/tečajeva).
\set ON_ERROR_STOP on
CREATE TABLE public.kmv_before AS
SELECT u, cur, rates, public.kmv_prev(u, cur, rates) AS j
FROM (VALUES ('a0000000-0000-0000-0000-00000000000a'),('b0000000-0000-0000-0000-00000000000b')) us(u)
CROSS JOIN (VALUES ('EUR','{}'::jsonb),('EUR','{"USD":1.1}'::jsonb),('USD','{"USD":1.1}'::jsonb)) c(cur,rates);
-- Obični član prije: odbijen.
DO $$ BEGIN
  PERFORM public.kmv_prev('c0000000-0000-0000-0000-00000000000c');
  RAISE EXCEPTION 'expected 42501';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'prije: obični član odbijen (42501)'; END $$;
