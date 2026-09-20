ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payer_name_snapshot text;

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

  IF NEW.payment_source LIKE 'custom:%'
     AND NEW.payer_name_snapshot IS NULL THEN
    BEGIN
      SELECT cps.name
        INTO NEW.payer_name_snapshot
        FROM public.custom_payment_sources cps
        WHERE cps.id = replace(NEW.payment_source, 'custom:', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public._expenses_fill_counterparty_snapshot() FROM PUBLIC;

DROP TRIGGER IF EXISTS expenses_fill_counterparty_snapshot ON public.expenses;
CREATE TRIGGER expenses_fill_counterparty_snapshot
BEFORE INSERT OR UPDATE OF income_source_id, type, payment_source ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public._expenses_fill_counterparty_snapshot();

UPDATE public.expenses e
   SET payer_name_snapshot = cps.name
  FROM public.custom_payment_sources cps
 WHERE e.payment_source LIKE 'custom:%'
   AND e.payer_name_snapshot IS NULL
   AND cps.id = replace(e.payment_source, 'custom:', '')::uuid;