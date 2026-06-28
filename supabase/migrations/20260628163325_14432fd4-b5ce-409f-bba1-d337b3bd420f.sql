
-- Val 1: event_at + time_confidence foundation (M2)

-- 1. Columns
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS event_at timestamptz,
  ADD COLUMN IF NOT EXISTS time_confidence text NOT NULL DEFAULT 'C3';

-- 2. Check constraint for tier values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_time_confidence_check'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_time_confidence_check
      CHECK (time_confidence IN ('C1','C2','C3','C4'));
  END IF;
END$$;

-- 3. Backfill: event_at := date::date + 12:00 Europe/Zagreb, confidence := 'C3'
-- Invariant: (event_at AT TIME ZONE 'Europe/Zagreb')::date = date::date
UPDATE public.expenses
SET event_at = ((date AT TIME ZONE 'Europe/Zagreb')::date + time '12:00') AT TIME ZONE 'Europe/Zagreb',
    time_confidence = COALESCE(time_confidence, 'C3')
WHERE event_at IS NULL;

-- 4. Now make event_at NOT NULL
ALTER TABLE public.expenses
  ALTER COLUMN event_at SET NOT NULL;

-- 5. Trigger function: derive event_at from date when needed
CREATE OR REPLACE FUNCTION public.expenses_event_at_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  derived timestamptz;
BEGIN
  -- Default confidence safety net
  IF NEW.time_confidence IS NULL THEN
    NEW.time_confidence := 'C3';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Writer did not provide event_at => derive from date as C3 synthetic noon (Europe/Zagreb)
    IF NEW.event_at IS NULL THEN
      NEW.event_at := ((NEW.date AT TIME ZONE 'Europe/Zagreb')::date + time '12:00') AT TIME ZONE 'Europe/Zagreb';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE branch
  IF TG_OP = 'UPDATE' THEN
    -- If writer explicitly changed event_at, honor it.
    IF NEW.event_at IS DISTINCT FROM OLD.event_at THEN
      RETURN NEW;
    END IF;

    -- Otherwise, only re-derive when date changed AND row is still C3
    IF (NEW.date IS DISTINCT FROM OLD.date) AND NEW.time_confidence = 'C3' THEN
      NEW.event_at := ((NEW.date AT TIME ZONE 'Europe/Zagreb')::date + time '12:00') AT TIME ZONE 'Europe/Zagreb';
    END IF;

    -- Safety: never allow event_at to become NULL via update
    IF NEW.event_at IS NULL THEN
      NEW.event_at := COALESCE(OLD.event_at,
        ((NEW.date AT TIME ZONE 'Europe/Zagreb')::date + time '12:00') AT TIME ZONE 'Europe/Zagreb');
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expenses_event_at_sync_ins ON public.expenses;
DROP TRIGGER IF EXISTS expenses_event_at_sync_upd ON public.expenses;

CREATE TRIGGER expenses_event_at_sync_ins
BEFORE INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.expenses_event_at_sync();

CREATE TRIGGER expenses_event_at_sync_upd
BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.expenses_event_at_sync();

-- 6. Index for future event_at-based reads (cheap, defensive)
CREATE INDEX IF NOT EXISTS expenses_event_at_idx ON public.expenses (event_at);
