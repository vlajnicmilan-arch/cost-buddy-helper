-- Živa salda — nalog 2: SQL čuvar realtime objave.
-- Provjerava: publikacija sadrži obje tablice, replica identity obje tablice je
-- i dalje DEFAULT, a politike su identične prije i nakon (ponovne) primjene.
-- Ne upisuje ništa u korisničke tablice — radi i na živoj bazi.

-- Publikacija postoji (čisti CI postgres je nema).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.ok(label text, cond boolean, detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(cond,false) THEN RAISE NOTICE 'PASS % %', label, detail;
  ELSE RAISE EXCEPTION 'FAIL % %', label, detail; END IF;
END $$;

-- Stanje PRIJE ponovne primjene iskaza objave.
-- (DROP prije CREATE: pooler sesija može zadržati privremene tablice iz prethodnog pokretanja.)
DROP TABLE IF EXISTS pg_temp.snap_before CASCADE;
CREATE TEMP TABLE snap_before AS
  SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

DROP TABLE IF EXISTS pg_temp.policies_before CASCADE;
CREATE TEMP TABLE policies_before AS
  SELECT tablename, policyname, cmd, roles::text AS roles, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('custom_payment_sources','krug_settlement_ledger');

CREATE TEMP TABLE repl_before AS
  SELECT c.relname, c.relreplident
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('custom_payment_sources','krug_settlement_ledger');

\if :REAPPLY
-- Isti iskaz kao u migraciji: ponovna primjena ne smije pasti ni nešto promijeniti.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'custom_payment_sources'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.custom_payment_sources;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'krug_settlement_ledger'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.krug_settlement_ledger;
  END IF;
END $$;
\endif

-- Stanje POSLIJE.
CREATE TEMP TABLE snap_after AS
  SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

CREATE TEMP TABLE policies_after AS
  SELECT tablename, policyname, cmd, roles::text AS roles, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('custom_payment_sources','krug_settlement_ledger');

CREATE TEMP TABLE repl_after AS
  SELECT c.relname, c.relreplident
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('custom_payment_sources','krug_settlement_ledger');

-- 1) Obje tablice su u objavi.
SELECT pg_temp.ok('objava custom_payment_sources',
  EXISTS (SELECT 1 FROM snap_after WHERE tablename = 'custom_payment_sources'));

SELECT pg_temp.ok('objava krug_settlement_ledger',
  EXISTS (SELECT 1 FROM snap_after WHERE tablename = 'krug_settlement_ledger'));

-- 2) Replica identity obje tablice je i dalje DEFAULT.
SELECT pg_temp.ok('replica identity DEFAULT (prije i poslije)',
  (SELECT count(*) FROM repl_before) = 2
  AND (SELECT count(*) FROM repl_after) = 2
  AND NOT EXISTS (SELECT 1 FROM repl_before WHERE relreplident <> 'd')
  AND NOT EXISTS (SELECT 1 FROM repl_after  WHERE relreplident <> 'd'));

-- 3) Politike identične prije i poslije (cijeli tekst, obje strane).
SELECT pg_temp.ok('politike nepromijenjene (custom_payment_sources, krug_settlement_ledger)',
  NOT EXISTS (SELECT * FROM policies_before EXCEPT SELECT * FROM policies_after)
  AND NOT EXISTS (SELECT * FROM policies_after EXCEPT SELECT * FROM policies_before));

-- 4) Ostale tablice objave nisu dirane.
SELECT pg_temp.ok('ostale tablice objave nepromijenjene',
  NOT EXISTS (
    SELECT tablename FROM snap_before
    WHERE tablename NOT IN ('custom_payment_sources','krug_settlement_ledger')
    EXCEPT
    SELECT tablename FROM snap_after
  ));
