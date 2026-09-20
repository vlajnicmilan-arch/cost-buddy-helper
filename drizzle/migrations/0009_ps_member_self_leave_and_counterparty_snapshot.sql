-- 1) Član dijeljenog novčanika smije sam obrisati SVOJ member red.
CREATE POLICY "Members can leave ps membership"
ON public.payment_source_members
FOR DELETE
TO authenticated
USING (user_id = auth.uid() AND role <> 'owner');

-- 2) Snimka imena protustrane prijenosa — ostaje čitljiva i nakon izlaska
--    iz dijeljenja (kad odredišni novčanik više nije vidljiv).
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS counterparty_name_snapshot text;

CREATE OR REPLACE FUNCTION public._expenses_fill_counterparty_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.type = 'transfer'
     AND NEW.income_source_id IS NOT NULL
     AND NEW.counterparty_name_snapshot IS NULL THEN
    SELECT cps.name
      INTO NEW.counterparty_name_snapshot
      FROM public.custom_payment_sources cps
      WHERE cps.id = NEW.income_source_id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public._expenses_fill_counterparty_snapshot() FROM PUBLIC;

DROP TRIGGER IF EXISTS expenses_fill_counterparty_snapshot ON public.expenses;
CREATE TRIGGER expenses_fill_counterparty_snapshot
BEFORE INSERT OR UPDATE OF income_source_id, type ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public._expenses_fill_counterparty_snapshot();

-- 3) Jednokratna popuna za postojeće prijenose (samo gdje je snimka prazna).
UPDATE public.expenses e
   SET counterparty_name_snapshot = cps.name
  FROM public.custom_payment_sources cps
 WHERE e.type = 'transfer'
   AND e.income_source_id = cps.id
   AND e.counterparty_name_snapshot IS NULL;