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
    -- project_milestones has no user_id column; resolve from parent project
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