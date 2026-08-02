ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS can_see_investor_price boolean NOT NULL DEFAULT false;

-- Samo vlasnik projekta smije mijenjati zastavicu. Politika
-- "Members can update own context" dopušta članu upis u vlastiti redak,
-- pa je potrebna druga brava na razini stupca.
CREATE OR REPLACE FUNCTION public.guard_member_investor_price_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.can_see_investor_price IS DISTINCT FROM OLD.can_see_investor_price
     AND NOT public.is_project_owner(NEW.project_id, auth.uid()) THEN
    RAISE EXCEPTION 'only_project_owner_can_set_investor_price_flag'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT'
     AND NEW.can_see_investor_price
     AND NOT public.is_project_owner(NEW.project_id, auth.uid()) THEN
    RAISE EXCEPTION 'only_project_owner_can_set_investor_price_flag'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_member_investor_price_flag ON public.project_members;
CREATE TRIGGER trg_guard_member_investor_price_flag
  BEFORE INSERT OR UPDATE ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_investor_price_flag();

-- Zastavica vrijedi ISKLJUČIVO za ulogu 'member'.
CREATE OR REPLACE FUNCTION public.member_sees_investor_price(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = _project_id
      AND pm.user_id = _user_id
      AND pm.role = 'member'
      AND pm.can_see_investor_price
  );
$$;

REVOKE ALL ON FUNCTION public.member_sees_investor_price(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_sees_investor_price(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.project_milestones_scoped AS
 SELECT id,
    project_id,
    name,
    description,
    status,
    start_date,
    due_date,
    completed_at,
    actual_start_date,
    actual_end_date,
    sort_order,
    color,
    depends_on_milestone_id,
    reminder_days_before,
    is_contingency,
    is_vtr,
    source_decision_id,
    deleted_at,
    created_at,
    updated_at,
        CASE
            WHEN get_project_role(project_id, auth.uid()) = ANY (ARRAY['owner'::text, 'viewer'::text, 'member'::text]) THEN budget
            ELSE NULL::numeric
        END AS budget,
        CASE
            WHEN get_project_role(project_id, auth.uid()) = ANY (ARRAY['owner'::text, 'viewer'::text, 'investor'::text]) THEN investor_price
            WHEN member_sees_investor_price(project_id, auth.uid()) THEN investor_price
            ELSE NULL::numeric
        END AS investor_price
   FROM project_milestones m
  WHERE deleted_at IS NULL AND can_read_project_phases(project_id, auth.uid());

GRANT SELECT ON public.project_milestones_scoped TO authenticated;