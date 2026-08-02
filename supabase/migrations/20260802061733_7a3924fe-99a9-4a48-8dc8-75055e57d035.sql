-- ============================================================================
-- Korak D — popravak: voditelj (member) nije mogao pisati napredak faze.
-- Uzrok: project_milestones ima SELECT samo za vlasnika (korak A), a Postgres
-- primjenjuje SELECT politiku i pri dohvatu retka za UPDATE/DELETE te unutar
-- EXISTS podupita u tuđim politikama.
-- Rješenje: SECURITY DEFINER pomoćnici + namjenski RPC za napredak.
-- Čitanje iznosa (korak A), project_milestones_scoped i can_read_project_phases
-- ostaju netaknuti — SELECT na sirovu tablicu se NE otvara sudionicima.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Pomoćnici nad fazom (zaobilaze RLS pozivatelja, provjeru rade sami)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_write_milestone_children(_milestone_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_milestones m
    WHERE m.id = _milestone_id
      AND public.can_write_project_progress(m.project_id, _user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_milestone_project_member(_milestone_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_milestones m
    WHERE m.id = _milestone_id
      AND public.is_project_member(m.project_id, _user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_milestone_project_owner(_milestone_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_milestones m
    WHERE m.id = _milestone_id
      AND public.is_project_owner(m.project_id, _user_id)
  );
$$;

REVOKE ALL ON FUNCTION public.can_write_milestone_children(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_milestone_project_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_milestone_project_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_milestone_children(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_milestone_project_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_milestone_project_owner(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Checkliste — EXISTS nad project_milestones zamijenjen pomoćnicima
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "members can view checklist" ON public.milestone_checklist_items;
CREATE POLICY "members can view checklist"
ON public.milestone_checklist_items
FOR SELECT
TO authenticated
USING (public.is_milestone_project_member(milestone_id, auth.uid()));

DROP POLICY IF EXISTS "owner or manager can insert checklist" ON public.milestone_checklist_items;
CREATE POLICY "owner or manager can insert checklist"
ON public.milestone_checklist_items
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.can_write_milestone_children(milestone_id, auth.uid())
);

DROP POLICY IF EXISTS "owner or manager can update checklist" ON public.milestone_checklist_items;
CREATE POLICY "owner or manager can update checklist"
ON public.milestone_checklist_items
FOR UPDATE
TO authenticated
USING (public.can_write_milestone_children(milestone_id, auth.uid()))
WITH CHECK (public.can_write_milestone_children(milestone_id, auth.uid()));

DROP POLICY IF EXISTS "owner or project owner can delete checklist" ON public.milestone_checklist_items;
CREATE POLICY "owner or project owner can delete checklist"
ON public.milestone_checklist_items
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_milestone_project_owner(milestone_id, auth.uid())
);

-- ---------------------------------------------------------------------------
-- 3. Namjenski put za napredak faze
--    Potpis NE SADRŽI nijedno novčano polje. Trigger
--    guard_milestone_column_writes ostaje kao druga brava za sve ostale putove.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_milestone_progress(
  p_milestone_id uuid,
  p_patch jsonb
)
RETURNS public.project_milestones_scoped
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project uuid;
  v_row public.project_milestones_scoped%ROWTYPE;
  k text;
  c_allowed CONSTANT text[] := ARRAY[
    'name','description','status','start_date','due_date',
    'actual_start_date','actual_end_date','completed_at',
    'sort_order','color','depends_on_milestone_id','reminder_days_before'
  ];
  c_forbidden CONSTANT text[] := ARRAY[
    'budget','investor_price','is_vtr','is_contingency','source_decision_id',
    'project_id','id','deleted_at','deleted_by'
  ];
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'milestone_patch_empty' USING ERRCODE = '22023';
  END IF;

  SELECT m.project_id INTO v_project
  FROM public.project_milestones m
  WHERE m.id = p_milestone_id AND m.deleted_at IS NULL;

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'milestone_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Uloga + stanje pretplate vlasnika u jednom predikatu (owner|member).
  IF NOT public.can_write_project_progress(v_project, auth.uid()) THEN
    RAISE EXCEPTION 'milestone_progress_forbidden' USING ERRCODE = '42501';
  END IF;

  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF k = ANY (c_forbidden) THEN
      RAISE EXCEPTION 'milestone_amount_forbidden' USING ERRCODE = '42501';
    ELSIF NOT (k = ANY (c_allowed)) THEN
      RAISE EXCEPTION 'milestone_field_not_allowed: %', k USING ERRCODE = '22023';
    END IF;
  END LOOP;

  UPDATE public.project_milestones m SET
    name        = CASE WHEN p_patch ? 'name'        THEN p_patch->>'name'        ELSE m.name END,
    description = CASE WHEN p_patch ? 'description' THEN p_patch->>'description' ELSE m.description END,
    status      = CASE WHEN p_patch ? 'status'      THEN p_patch->>'status'      ELSE m.status END,
    start_date        = CASE WHEN p_patch ? 'start_date'        THEN (p_patch->>'start_date')::date        ELSE m.start_date END,
    due_date          = CASE WHEN p_patch ? 'due_date'          THEN (p_patch->>'due_date')::date          ELSE m.due_date END,
    actual_start_date = CASE WHEN p_patch ? 'actual_start_date' THEN (p_patch->>'actual_start_date')::date ELSE m.actual_start_date END,
    actual_end_date   = CASE WHEN p_patch ? 'actual_end_date'   THEN (p_patch->>'actual_end_date')::date   ELSE m.actual_end_date END,
    completed_at      = CASE WHEN p_patch ? 'completed_at'      THEN (p_patch->>'completed_at')::timestamptz ELSE m.completed_at END,
    sort_order        = CASE WHEN p_patch ? 'sort_order'        THEN (p_patch->>'sort_order')::int         ELSE m.sort_order END,
    color             = CASE WHEN p_patch ? 'color'             THEN p_patch->>'color'                     ELSE m.color END,
    depends_on_milestone_id = CASE WHEN p_patch ? 'depends_on_milestone_id' THEN (p_patch->>'depends_on_milestone_id')::uuid ELSE m.depends_on_milestone_id END,
    reminder_days_before    = CASE WHEN p_patch ? 'reminder_days_before'    THEN (p_patch->>'reminder_days_before')::int    ELSE m.reminder_days_before END,
    updated_at = now()
  WHERE m.id = p_milestone_id;

  -- Povrat kroz role-scoped pogled: pozivatelj dobiva samo ono što smije vidjeti.
  SELECT * INTO v_row FROM public.project_milestones_scoped v WHERE v.id = p_milestone_id;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_milestone_progress(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_milestone_progress(uuid, jsonb) TO authenticated;