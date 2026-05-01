
-- 1) Dodaj user_id na project_workers (mapiranje radnik ↔ user)
ALTER TABLE public.project_workers
  ADD COLUMN IF NOT EXISTS user_id uuid NULL;

CREATE UNIQUE INDEX IF NOT EXISTS project_workers_project_user_uniq
  ON public.project_workers(project_id, user_id)
  WHERE user_id IS NOT NULL;

-- 2) Dodaj hours kolonu na project_work_logs
ALTER TABLE public.project_work_logs
  ADD COLUMN IF NOT EXISTS hours numeric NULL
  CHECK (hours IS NULL OR (hours >= 0 AND hours <= 24));

-- 3) Dodaj worker_id na project_invitations (za auto-mapping)
ALTER TABLE public.project_invitations
  ADD COLUMN IF NOT EXISTS worker_id uuid NULL
  REFERENCES public.project_workers(id) ON DELETE SET NULL;

-- 4) Trigger funkcija: dnevnik → entry sync
CREATE OR REPLACE FUNCTION public.sync_work_log_to_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker_id uuid;
  v_business_profile_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT id, business_profile_id INTO v_worker_id, v_business_profile_id
      FROM project_workers
      WHERE project_id = OLD.project_id AND user_id = OLD.user_id
      LIMIT 1;
    IF v_worker_id IS NOT NULL THEN
      DELETE FROM project_work_entries
        WHERE worker_id = v_worker_id AND work_date = OLD.log_date;
    END IF;
    RETURN OLD;
  END IF;

  -- INSERT or UPDATE
  IF NEW.hours IS NULL THEN
    -- Ako su sati uklonjeni na UPDATE, briši pridruženi entry
    IF TG_OP = 'UPDATE' AND OLD.hours IS NOT NULL THEN
      SELECT id INTO v_worker_id FROM project_workers
        WHERE project_id = NEW.project_id AND user_id = NEW.user_id LIMIT 1;
      IF v_worker_id IS NOT NULL THEN
        DELETE FROM project_work_entries
          WHERE worker_id = v_worker_id AND work_date = NEW.log_date;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  SELECT id, business_profile_id INTO v_worker_id, v_business_profile_id
    FROM project_workers
    WHERE project_id = NEW.project_id AND user_id = NEW.user_id
    LIMIT 1;

  IF v_worker_id IS NULL THEN
    -- Korisnik još nije mapiran na worker zapis — preskoči, ne ruši insert
    RETURN NEW;
  END IF;

  INSERT INTO project_work_entries (
    worker_id, project_id, work_date,
    scheduled_hours, actual_hours, note, milestone_ids, business_profile_id
  )
  VALUES (
    v_worker_id, NEW.project_id, NEW.log_date,
    NEW.hours, NEW.hours, NEW.summary,
    CASE WHEN NEW.milestone_id IS NULL THEN NULL ELSE ARRAY[NEW.milestone_id] END,
    v_business_profile_id
  )
  ON CONFLICT (worker_id, work_date) DO UPDATE
    SET actual_hours = EXCLUDED.actual_hours,
        scheduled_hours = EXCLUDED.scheduled_hours,
        note = EXCLUDED.note,
        milestone_ids = EXCLUDED.milestone_ids,
        updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_work_log_to_entry ON public.project_work_logs;
CREATE TRIGGER trg_sync_work_log_to_entry
  AFTER INSERT OR UPDATE OR DELETE ON public.project_work_logs
  FOR EACH ROW EXECUTE FUNCTION public.sync_work_log_to_entry();

-- 5) Stroga RLS izolacija: član vidi samo svoje
DROP POLICY IF EXISTS "Members can view project work logs" ON public.project_work_logs;
CREATE POLICY "Owners see all logs, members see only own"
  ON public.project_work_logs FOR SELECT
  USING (
    public.is_project_owner(project_id, auth.uid())
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Project members can view work entries" ON public.project_work_entries;
CREATE POLICY "Owners see all entries, members see only own"
  ON public.project_work_entries FOR SELECT
  USING (
    public.is_project_owner(project_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.project_workers w
      WHERE w.id = project_work_entries.worker_id
        AND w.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Project members can view workers" ON public.project_workers;
CREATE POLICY "Owners see all workers, members see only own row"
  ON public.project_workers FOR SELECT
  USING (
    public.is_project_owner(project_id, auth.uid())
    OR user_id = auth.uid()
  );
