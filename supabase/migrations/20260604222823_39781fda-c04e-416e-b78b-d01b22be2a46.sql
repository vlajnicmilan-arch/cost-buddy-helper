-- BEFORE INSERT: prepiši created_by na auth.uid() (zatvara spoofing rupu).
CREATE OR REPLACE FUNCTION public.krug_enforce_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    -- service_role / pozadinski poslovi: created_by mora biti eksplicitan
    IF NEW.created_by IS NULL THEN
      RAISE EXCEPTION 'krug.created_by must be set';
    END IF;
    RETURN NEW;
  END IF;
  -- authenticated path: bezuvjetno prepiši
  NEW.created_by := v_uid;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS krug_enforce_created_by_bef ON public.krug;
CREATE TRIGGER krug_enforce_created_by_bef
BEFORE INSERT ON public.krug
FOR EACH ROW EXECUTE FUNCTION public.krug_enforce_created_by();

-- AFTER INSERT: bootstrap ownership + 'punopravni' membership za creatora.
-- Bez ovoga PostgREST RETURNING padne na krug_select_member RLS policy.
CREATE OR REPLACE FUNCTION public.krug_bootstrap_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.krug_ownership (krug_id, user_id)
  VALUES (NEW.id, NEW.created_by)
  ON CONFLICT (krug_id) DO NOTHING;

  INSERT INTO public.krug_membership (krug_id, user_id, role, added_by)
  VALUES (NEW.id, NEW.created_by, 'punopravni'::public.krug_membership_role, NEW.created_by)
  ON CONFLICT (krug_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS krug_bootstrap_creator_aft ON public.krug;
CREATE TRIGGER krug_bootstrap_creator_aft
AFTER INSERT ON public.krug
FOR EACH ROW EXECUTE FUNCTION public.krug_bootstrap_creator();