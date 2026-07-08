DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='project_milestones') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_milestones;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='project_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_members;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='project_activity_log') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_activity_log;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='project_work_entries') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_work_entries;
  END IF;
END $$;

ALTER TABLE public.project_milestones REPLICA IDENTITY FULL;
ALTER TABLE public.project_members REPLICA IDENTITY FULL;
ALTER TABLE public.project_activity_log REPLICA IDENTITY FULL;
ALTER TABLE public.project_work_entries REPLICA IDENTITY FULL;