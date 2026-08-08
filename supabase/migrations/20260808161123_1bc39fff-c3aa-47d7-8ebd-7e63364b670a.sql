-- Krug Emit Notification Overload Fix
DROP FUNCTION IF EXISTS public.krug_emit_notification(text, uuid, uuid, uuid, uuid, text, uuid[]);

REVOKE EXECUTE ON FUNCTION public.krug_emit_notification(text, uuid, uuid, uuid, uuid, text, uuid[], jsonb) FROM PUBLIC, anon, authenticated;