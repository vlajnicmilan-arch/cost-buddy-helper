CREATE OR REPLACE FUNCTION public.krug_enforce_punopravni_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preset text;
  v_cap int;
  v_count int;
BEGIN
  -- Only enforce when the row is/becomes a punopravni membership.
  IF NEW.role <> 'punopravni'::public.krug_membership_role THEN
    RETURN NEW;
  END IF;

  SELECT preset::text INTO v_preset FROM public.krug WHERE id = NEW.krug_id;
  IF v_preset IS NULL THEN
    RETURN NEW;
  END IF;

  v_cap := CASE v_preset
    WHEN 'partner' THEN 2
    WHEN 'su_roditelj' THEN 2
    WHEN 'cimer' THEN 6
    ELSE NULL
  END;

  IF v_cap IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.krug_membership
  WHERE krug_id = NEW.krug_id
    AND role = 'punopravni'::public.krug_membership_role
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF v_count + 1 > v_cap THEN
    RAISE EXCEPTION 'krug_punopravni_cap: cap=% preset=%', v_cap, v_preset
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS krug_enforce_punopravni_cap_ins ON public.krug_membership;
DROP TRIGGER IF EXISTS krug_enforce_punopravni_cap_upd ON public.krug_membership;

CREATE TRIGGER krug_enforce_punopravni_cap_ins
BEFORE INSERT ON public.krug_membership
FOR EACH ROW EXECUTE FUNCTION public.krug_enforce_punopravni_cap();

CREATE TRIGGER krug_enforce_punopravni_cap_upd
BEFORE UPDATE OF role ON public.krug_membership
FOR EACH ROW EXECUTE FUNCTION public.krug_enforce_punopravni_cap();