-- CI-only, korak 1 od 2 za pošten SECDEF anon gate.
--
-- Snima popis funkcija koje postoje PRIJE nego se primijene whitelistane
-- migracije. Sve iz ovog popisa dolazi iz kuriranog baselinea (ručna
-- aproksimacija žive sheme), koji NE reproducira produkcijske REVOKE
-- migracije — takve funkcije su izuzete iz invarijante i njih čisti
-- secdef_anon_shim.sql.
--
-- Sve što se pojavi POSLIJE ovog snimka (tj. dolazi iz stvarne migracije)
-- mora samo od sebe biti revokirano od anon, inače invarijanta pada.
-- Vidi ci_snapshot_post.sql i secdef_anon_shim.sql.

CREATE SCHEMA IF NOT EXISTS ci_meta;

DROP TABLE IF EXISTS ci_meta.pre_funcs;
CREATE TABLE ci_meta.pre_funcs AS
SELECT p.oid::regprocedure::text AS sig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public';

DO $$
BEGIN
  RAISE NOTICE 'ci_snapshot_pre: % funkcija u kuriranom baselineu',
    (SELECT count(*) FROM ci_meta.pre_funcs);
END
$$;
