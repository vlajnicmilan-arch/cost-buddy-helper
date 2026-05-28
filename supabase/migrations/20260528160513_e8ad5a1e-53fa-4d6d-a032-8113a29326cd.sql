-- Remove family_messages from realtime publication (ignore if not present)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.family_messages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP TABLE IF EXISTS public.family_messages CASCADE;