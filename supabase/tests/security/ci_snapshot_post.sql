-- CI-only, korak 2 od 2 za pošten SECDEF anon gate.
--
-- Izračunava skup funkcija koje su donijele whitelistane migracije:
--   migration_funcs = (funkcije poslije migracija) MINUS (ci_meta.pre_funcs)
--
-- Taj skup je JEDINI koji secdef_anon_shim.sql NE smije dirati — on je
-- predmet invarijante. Pokreće se odmah nakon primjene migracija, prije
-- role_write_baseline.sql.

CREATE SCHEMA IF NOT EXISTS ci_meta;

DROP TABLE IF EXISTS ci_meta.migration_funcs;
CREATE TABLE ci_meta.migration_funcs AS
SELECT p.oid::regprocedure::text AS sig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.oid::regprocedure::text NOT IN (SELECT sig FROM ci_meta.pre_funcs);

DO $$
BEGIN
  RAISE NOTICE 'ci_snapshot_post: % funkcija dolazi iz migracija (pod invarijantom)',
    (SELECT count(*) FROM ci_meta.migration_funcs);
END
$$;
