CREATE OR REPLACE FUNCTION public.krug_enforce_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    IF NEW.created_by IS NULL THEN
      RAISE EXCEPTION 'krug.created_by must be set';
    END IF;
    RETURN NEW;
  END IF;

  NEW.created_by := v_uid;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS krug_enforce_created_by_bef ON public.krug;
CREATE TRIGGER krug_enforce_created_by_bef
BEFORE INSERT OR UPDATE ON public.krug
FOR EACH ROW EXECUTE FUNCTION public.krug_enforce_created_by();

DROP POLICY IF EXISTS "krug_select_member" ON public.krug;
CREATE POLICY "krug_select_member"
  ON public.krug FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.krug_is_member(id, auth.uid()));