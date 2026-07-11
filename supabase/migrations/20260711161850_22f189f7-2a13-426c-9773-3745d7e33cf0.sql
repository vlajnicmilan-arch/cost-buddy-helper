-- Krug Realtime + Invalidation Patch
-- Uključi Krug tablice u supabase_realtime publikaciju kako bi klijent
-- (useKrug, useMyKrugs, useKrugMembers, useKrugDeletionRequest) mogao
-- primati INSERT/UPDATE/DELETE eventove bez focus/reconnect refetch trika.
--
-- REPLICA IDENTITY FULL — potrebno da DELETE payload sadrži cijeli stari red
-- (klijent treba `krug_id` iz `old` za invalidaciju/filter na svim tablicama).

DO $$
BEGIN
  ALTER TABLE public.krug REPLICA IDENTITY FULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
  ALTER TABLE public.krug_membership REPLICA IDENTITY FULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
  ALTER TABLE public.krug_deletion_request REPLICA IDENTITY FULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
  ALTER TABLE public.krug_deletion_vote REPLICA IDENTITY FULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dodaj u publikaciju idempotentno (ADD TABLE puca ako je već član).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.krug;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.krug_membership;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.krug_deletion_request;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.krug_deletion_vote;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;