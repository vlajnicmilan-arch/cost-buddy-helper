-- Živa salda — nalog 2: realtime objava tablica sa saldom.
-- Idempotentno: ako je tablica već u objavi, ništa se ne radi.
-- REPLICA IDENTITY se ne mijenja; politike, funkcije, okidači i podaci se ne diraju.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'custom_payment_sources'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.custom_payment_sources;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'krug_settlement_ledger'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.krug_settlement_ledger;
  END IF;
END $$;