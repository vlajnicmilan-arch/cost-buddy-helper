CREATE TABLE public.workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_profile_id uuid REFERENCES public.business_profiles(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  note text,
  linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workers TO authenticated;
GRANT ALL ON public.workers TO service_role;

ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own workers"
  ON public.workers FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Linked user can read own worker identity"
  ON public.workers FOR SELECT TO authenticated
  USING (linked_user_id = auth.uid());

CREATE INDEX idx_workers_user ON public.workers(user_id);
CREATE INDEX idx_workers_business_profile ON public.workers(business_profile_id);
CREATE INDEX idx_workers_linked_user ON public.workers(linked_user_id);

CREATE TRIGGER workers_set_updated_at
  BEFORE UPDATE ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.project_workers
  ADD COLUMN worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL;

CREATE INDEX idx_project_workers_worker_id ON public.project_workers(worker_id);