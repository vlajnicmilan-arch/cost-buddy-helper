
-- P0 Hotfix B: broadcast Krug soft-delete to members whose RLS view of the row
-- disappears after deleted_at is set (krug_is_member becomes false), so
-- postgres_changes UPDATE never reaches them. We emit a lightweight Realtime
-- broadcast to a per-user topic; client hooks invalidate on receipt.

CREATE OR REPLACE FUNCTION public.krug_broadcast_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_payload jsonb;
BEGIN
  -- Only fire on NULL -> NOT NULL transition of deleted_at
  IF NEW.deleted_at IS NULL OR OLD.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'krug_id', NEW.id,
    'deleted_at', NEW.deleted_at
  );

  -- Owner
  FOR v_uid IN
    SELECT user_id FROM public.krug_ownership WHERE krug_id = NEW.id
  LOOP
    PERFORM realtime.send(
      v_payload,
      'krug_deleted',
      'krug:user:' || v_uid::text,
      false
    );
  END LOOP;

  -- Members (owner may double-fire; klijent je idempotentan — samo invalida)
  FOR v_uid IN
    SELECT user_id FROM public.krug_membership WHERE krug_id = NEW.id
  LOOP
    PERFORM realtime.send(
      v_payload,
      'krug_deleted',
      'krug:user:' || v_uid::text,
      false
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the soft-delete on a broadcast failure
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS krug_broadcast_soft_delete_aft ON public.krug;
CREATE TRIGGER krug_broadcast_soft_delete_aft
AFTER UPDATE OF deleted_at ON public.krug
FOR EACH ROW
EXECUTE FUNCTION public.krug_broadcast_soft_delete();
