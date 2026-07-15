-- ============================================================================
-- Modul "Odluke" — Faza 3: prilozi (foto/dokument)
-- ============================================================================

CREATE TABLE public.project_decision_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES public.project_decisions(id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.project_decision_steps(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pda_decision ON public.project_decision_attachments(decision_id);
CREATE INDEX idx_pda_step     ON public.project_decision_attachments(step_id);

GRANT SELECT, INSERT, UPDATE ON public.project_decision_attachments TO authenticated;
GRANT ALL ON public.project_decision_attachments TO service_role;

ALTER TABLE public.project_decision_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Decision parties can read attachments"
  ON public.project_decision_attachments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_decisions d
      WHERE d.id = decision_id
        AND public.is_project_decision_party(d.project_id, auth.uid())
    )
  );

CREATE POLICY "Decision parties can insert attachments"
  ON public.project_decision_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.project_decisions d
      WHERE d.id = decision_id
        AND public.is_project_decision_party(d.project_id, auth.uid())
    )
  );

CREATE POLICY "Uploader can link own attachment to a step"
  ON public.project_decision_attachments
  FOR UPDATE
  TO authenticated
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

-- Enforce trigger: max 3 per step, accept/reject nema priloga, immutable jezgra
CREATE OR REPLACE FUNCTION public.project_decision_attachment_enforce()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_count int;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.decision_id  <> OLD.decision_id
       OR NEW.storage_path <> OLD.storage_path
       OR NEW.file_name    <> OLD.file_name
       OR NEW.mime_type    <> OLD.mime_type
       OR NEW.size_bytes   <> OLD.size_bytes
       OR NEW.uploaded_by  <> OLD.uploaded_by THEN
      RAISE EXCEPTION 'attachment_immutable_fields'
        USING HINT = 'Prilozi su append-only; mijenja se samo veza na korak.';
    END IF;
    IF OLD.step_id IS NOT NULL AND NEW.step_id IS DISTINCT FROM OLD.step_id THEN
      RAISE EXCEPTION 'attachment_step_link_immutable'
        USING HINT = 'Veza priloga na korak se ne smije mijenjati.';
    END IF;
  END IF;

  IF NEW.step_id IS NOT NULL THEN
    SELECT action INTO v_action
      FROM public.project_decision_steps
      WHERE id = NEW.step_id;
    IF v_action IS NULL THEN
      RAISE EXCEPTION 'attachment_step_not_found';
    END IF;

    IF v_action IN ('accept','reject') THEN
      RAISE EXCEPTION 'attachment_not_allowed_on_accept_reject'
        USING HINT = 'Prihvat/odbijanje ne mogu nositi priloge.';
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.project_decision_attachments
      WHERE step_id = NEW.step_id
        AND id <> NEW.id;

    IF v_count >= 3 THEN
      RAISE EXCEPTION 'attachment_max_three_per_step'
        USING HINT = 'Najviše 3 priloga po koraku.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.project_decision_attachment_enforce() FROM anon, public;

DROP TRIGGER IF EXISTS trg_project_decision_attachment_enforce
  ON public.project_decision_attachments;

CREATE TRIGGER trg_project_decision_attachment_enforce
  BEFORE INSERT OR UPDATE ON public.project_decision_attachments
  FOR EACH ROW EXECUTE FUNCTION public.project_decision_attachment_enforce();