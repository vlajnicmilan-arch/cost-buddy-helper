
-- Proširenje expenses za sustav avansa suradnicima
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS collaborator_id uuid REFERENCES public.project_collaborators(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_advance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linked_advance_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_expenses_collaborator_advance
  ON public.expenses (collaborator_id, is_advance)
  WHERE collaborator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_linked_advance_ids
  ON public.expenses USING GIN (linked_advance_ids)
  WHERE array_length(linked_advance_ids, 1) > 0;

-- Trigger funkcija: validira da se isti avans ne pojavljuje na dva konačna računa,
-- te da su svi povezani ID-jevi stvarno avansi istog suradnika.
CREATE OR REPLACE FUNCTION public.validate_advance_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  adv_id uuid;
  adv_row RECORD;
  conflict_id uuid;
BEGIN
  -- Skip if no links
  IF NEW.linked_advance_ids IS NULL OR array_length(NEW.linked_advance_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Konačni račun ne smije biti označen kao avans
  IF NEW.is_advance THEN
    RAISE EXCEPTION 'advance_cannot_link_other_advances';
  END IF;

  FOREACH adv_id IN ARRAY NEW.linked_advance_ids
  LOOP
    SELECT id, is_advance, collaborator_id, user_id INTO adv_row
      FROM public.expenses WHERE id = adv_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'advance_not_found: %', adv_id;
    END IF;

    IF NOT adv_row.is_advance THEN
      RAISE EXCEPTION 'linked_id_is_not_advance: %', adv_id;
    END IF;

    IF NEW.collaborator_id IS NULL OR adv_row.collaborator_id IS DISTINCT FROM NEW.collaborator_id THEN
      RAISE EXCEPTION 'advance_collaborator_mismatch: %', adv_id;
    END IF;

    -- Provjera da avans nije već vezan na drugi konačni račun
    SELECT id INTO conflict_id
    FROM public.expenses
    WHERE id <> NEW.id
      AND adv_id = ANY(linked_advance_ids)
    LIMIT 1;

    IF conflict_id IS NOT NULL THEN
      RAISE EXCEPTION 'advance_already_linked: % to %', adv_id, conflict_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_advance_links ON public.expenses;
CREATE TRIGGER trg_validate_advance_links
  BEFORE INSERT OR UPDATE OF linked_advance_ids, collaborator_id, is_advance
  ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_advance_links();
