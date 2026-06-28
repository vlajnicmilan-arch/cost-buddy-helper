-- Val 2: precision foundation for event_at merge semantics.
-- Adds `user_edited_event_at` flag and the `resolve_event_at_merge` helper.
-- No backfill. No retroactive promotion. No `time_source`. No `posted_at`.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS user_edited_event_at boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.resolve_event_at_merge(
  existing_event_at     timestamptz,
  existing_confidence   text,
  existing_user_edited  boolean,
  incoming_event_at     timestamptz,
  incoming_confidence   text
)
RETURNS TABLE(event_at timestamptz, time_confidence text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  existing_tier int;
  incoming_tier int;
BEGIN
  -- Rule 1: explicit user edit on existing row wins over everything.
  IF existing_user_edited = true THEN
    event_at := existing_event_at;
    time_confidence := existing_confidence;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Tier ranking: C1 (highest) > C2 > C3 > C4 > NULL.
  existing_tier := CASE existing_confidence
    WHEN 'C1' THEN 4
    WHEN 'C2' THEN 3
    WHEN 'C3' THEN 2
    WHEN 'C4' THEN 1
    ELSE 0
  END;

  incoming_tier := CASE incoming_confidence
    WHEN 'C1' THEN 4
    WHEN 'C2' THEN 3
    WHEN 'C3' THEN 2
    WHEN 'C4' THEN 1
    ELSE 0
  END;

  -- Rule 2: incoming wins only when its tier is strictly higher.
  IF incoming_tier > existing_tier THEN
    event_at := incoming_event_at;
    time_confidence := incoming_confidence;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Rule 3: equal or lower tier → keep existing.
  event_at := existing_event_at;
  time_confidence := existing_confidence;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.resolve_event_at_merge(timestamptz, text, boolean, timestamptz, text)
  IS 'Val 2 tier merge: user-edited wins, else higher confidence tier wins, else keep existing.';