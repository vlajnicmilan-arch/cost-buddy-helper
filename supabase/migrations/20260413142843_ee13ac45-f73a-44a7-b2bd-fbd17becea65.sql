
-- Create time_clock_entries table for Croatian labor law compliance (NN 55/2024)
CREATE TABLE public.time_clock_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id uuid NOT NULL REFERENCES public.project_workers(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  recorded_by uuid NOT NULL,
  work_date date NOT NULL,
  clock_in timestamptz,
  clock_out timestamptz,
  break_start timestamptz,
  break_end timestamptz,
  break_minutes integer NOT NULL DEFAULT 0,
  net_hours numeric NOT NULL DEFAULT 0,
  entry_type text NOT NULL DEFAULT 'regular',
  absence_type text,
  note text,
  location_coords text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_time_clock_entries_worker_date ON public.time_clock_entries(worker_id, work_date);
CREATE INDEX idx_time_clock_entries_project_date ON public.time_clock_entries(project_id, work_date);
CREATE INDEX idx_time_clock_entries_user_id ON public.time_clock_entries(user_id);

-- Enable RLS
ALTER TABLE public.time_clock_entries ENABLE ROW LEVEL SECURITY;

-- Owner (business owner) full access
CREATE POLICY "Owners can view time clock entries"
  ON public.time_clock_entries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Owners can create time clock entries"
  ON public.time_clock_entries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update time clock entries"
  ON public.time_clock_entries FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Owners can delete time clock entries"
  ON public.time_clock_entries FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Project members (managers) can view and insert
CREATE POLICY "Project members can view time clock entries"
  ON public.time_clock_entries FOR SELECT
  TO authenticated
  USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can create time clock entries"
  ON public.time_clock_entries FOR INSERT
  TO authenticated
  WITH CHECK (is_project_member(project_id, auth.uid()) AND auth.uid() = recorded_by);

-- Trigger for updated_at
CREATE TRIGGER update_time_clock_entries_updated_at
  BEFORE UPDATE ON public.time_clock_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
