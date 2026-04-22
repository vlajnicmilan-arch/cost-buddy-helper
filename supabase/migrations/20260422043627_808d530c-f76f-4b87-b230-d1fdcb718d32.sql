-- Create project_work_logs table
CREATE TABLE public.project_work_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES public.project_milestones(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  weather text,
  summary text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_work_logs_unique_per_author UNIQUE (project_id, log_date, user_id)
);

CREATE INDEX idx_project_work_logs_project_date ON public.project_work_logs(project_id, log_date DESC);
CREATE INDEX idx_project_work_logs_milestone ON public.project_work_logs(milestone_id);

-- Enable RLS
ALTER TABLE public.project_work_logs ENABLE ROW LEVEL SECURITY;

-- Members can view all logs in projects they're part of
CREATE POLICY "Members can view project work logs"
ON public.project_work_logs
FOR SELECT
USING (public.is_project_member(project_id, auth.uid()));

-- Members can create logs (with their own user_id)
CREATE POLICY "Members can insert their own work logs"
ON public.project_work_logs
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND public.is_project_member(project_id, auth.uid())
);

-- Authors can update their own logs
CREATE POLICY "Authors can update their own work logs"
ON public.project_work_logs
FOR UPDATE
USING (auth.uid() = user_id);

-- Authors or project owners can delete logs
CREATE POLICY "Authors or owners can delete work logs"
ON public.project_work_logs
FOR DELETE
USING (
  auth.uid() = user_id
  OR public.is_project_owner(project_id, auth.uid())
);

-- Trigger for updated_at
CREATE TRIGGER update_project_work_logs_updated_at
BEFORE UPDATE ON public.project_work_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Extend log_project_activity to handle project_work_logs
CREATE OR REPLACE FUNCTION public.log_project_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_user_id uuid;
  v_action text;
  v_description text;
BEGIN
  IF TG_TABLE_NAME = 'expenses' THEN
    v_project_id := COALESCE(NEW.project_id, OLD.project_id);
    IF v_project_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
    v_user_id := COALESCE(NEW.user_id, OLD.user_id);
    IF TG_OP = 'INSERT' THEN
      v_action := CASE WHEN NEW.type = 'income' THEN 'income_added' ELSE 'expense_added' END;
      v_description := COALESCE(NEW.description, '') || ' (' || NEW.amount::text || ')';
    ELSIF TG_OP = 'DELETE' THEN
      v_action := 'expense_deleted';
      v_description := COALESCE(OLD.description, '');
    ELSE RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'project_milestones' THEN
    v_project_id := COALESCE(NEW.project_id, OLD.project_id);
    SELECT user_id INTO v_user_id FROM public.projects WHERE id = v_project_id;
    IF TG_OP = 'INSERT' THEN
      v_action := 'milestone_added';
      v_description := NEW.name;
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'milestone_status_changed';
      v_description := NEW.name || ' → ' || NEW.status;
    ELSIF TG_OP = 'DELETE' THEN
      v_action := 'milestone_deleted';
      v_description := OLD.name;
    ELSE RETURN COALESCE(NEW, OLD);
    END IF;
  ELSIF TG_TABLE_NAME = 'project_work_logs' THEN
    v_project_id := COALESCE(NEW.project_id, OLD.project_id);
    v_user_id := COALESCE(NEW.user_id, OLD.user_id);
    IF TG_OP = 'INSERT' THEN
      v_action := 'work_log_added';
      v_description := to_char(NEW.log_date, 'DD.MM.YYYY');
    ELSIF TG_OP = 'UPDATE' THEN
      v_action := 'work_log_updated';
      v_description := to_char(NEW.log_date, 'DD.MM.YYYY');
    ELSIF TG_OP = 'DELETE' THEN
      v_action := 'work_log_deleted';
      v_description := to_char(OLD.log_date, 'DD.MM.YYYY');
    END IF;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_user_id IS NOT NULL AND v_project_id IS NOT NULL THEN
    INSERT INTO public.project_activity_log (project_id, user_id, action_type, action_description)
    VALUES (v_project_id, v_user_id, v_action, v_description);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Activity log trigger
CREATE TRIGGER log_project_work_logs_activity
AFTER INSERT OR UPDATE OR DELETE ON public.project_work_logs
FOR EACH ROW
EXECUTE FUNCTION public.log_project_activity();