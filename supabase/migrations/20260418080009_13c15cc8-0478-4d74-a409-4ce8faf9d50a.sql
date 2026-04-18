
-- Composite index for project transaction queries (massively speeds up project filtering by business + project + date)
CREATE INDEX IF NOT EXISTS idx_expenses_business_project_date
  ON public.expenses (business_profile_id, project_id, date DESC)
  WHERE project_id IS NOT NULL;

-- Schema validation trigger for project_estimates.items (must be valid JSON array of items)
CREATE OR REPLACE FUNCTION public.validate_estimate_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
BEGIN
  IF NEW.items IS NULL THEN RETURN NEW; END IF;
  IF jsonb_typeof(NEW.items) <> 'array' THEN
    RAISE EXCEPTION 'project_estimates.items must be a JSON array, got %', jsonb_typeof(NEW.items);
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
  LOOP
    IF NOT (item ? 'description') OR jsonb_typeof(item->'description') <> 'string' THEN
      RAISE EXCEPTION 'estimate item missing description (text)';
    END IF;
    IF NOT (item ? 'quantity') OR jsonb_typeof(item->'quantity') NOT IN ('number') THEN
      RAISE EXCEPTION 'estimate item missing numeric quantity';
    END IF;
    IF NOT (item ? 'unit_price') OR jsonb_typeof(item->'unit_price') NOT IN ('number') THEN
      RAISE EXCEPTION 'estimate item missing numeric unit_price';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_estimate_items ON public.project_estimates;
CREATE TRIGGER trg_validate_estimate_items
BEFORE INSERT OR UPDATE OF items ON public.project_estimates
FOR EACH ROW EXECUTE FUNCTION public.validate_estimate_items();
