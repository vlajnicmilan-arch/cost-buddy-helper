
CREATE TABLE public.push_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  source_function text,
  title text,
  body text,
  token_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  fcm_error_codes jsonb,
  request_payload jsonb,
  response_summary jsonb,
  duration_ms integer
);

CREATE INDEX idx_push_delivery_logs_created_at ON public.push_delivery_logs(created_at DESC);
CREATE INDEX idx_push_delivery_logs_user_id ON public.push_delivery_logs(user_id);
CREATE INDEX idx_push_delivery_logs_source ON public.push_delivery_logs(source_function);

ALTER TABLE public.push_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view push delivery logs"
ON public.push_delivery_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete push delivery logs"
ON public.push_delivery_logs
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.cleanup_old_push_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.push_delivery_logs WHERE created_at < now() - interval '30 days';
END;
$function$;

CREATE OR REPLACE FUNCTION public.maybe_cleanup_push_logs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF random() < 0.005 THEN
    PERFORM public.cleanup_old_push_logs();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_maybe_cleanup_push_logs
AFTER INSERT ON public.push_delivery_logs
FOR EACH ROW
EXECUTE FUNCTION public.maybe_cleanup_push_logs();
