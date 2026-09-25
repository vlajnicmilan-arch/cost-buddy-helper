CREATE OR REPLACE FUNCTION public.krug_notify_outbox_mark_delivered(p_dedup_ref text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.krug_notify_outbox
     SET delivered_at = now()
   WHERE dedup_ref = p_dedup_ref
     AND delivered_at IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.krug_notify_outbox_mark_delivered(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.krug_notify_outbox_mark_delivered(text) TO service_role;