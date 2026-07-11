CREATE OR REPLACE FUNCTION public._krug_emit_proposed_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.krug_id IS NOT NULL
     AND NEW.krug_privacy = 'shared'::public.krug_privacy
     AND NEW.krug_shared_status = 'predlozena'::public.krug_shared_status
  THEN
    PERFORM public.krug_emit_notification(
      'krug_expense_proposed',
      NEW.krug_id,
      NEW.user_id,
      NEW.id,
      NULL,
      'krug_expense_proposed:ins:' || NEW.id::text,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_krug_emit_proposed_on_insert ON public.expenses;
CREATE TRIGGER trg_krug_emit_proposed_on_insert
AFTER INSERT ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public._krug_emit_proposed_on_insert();