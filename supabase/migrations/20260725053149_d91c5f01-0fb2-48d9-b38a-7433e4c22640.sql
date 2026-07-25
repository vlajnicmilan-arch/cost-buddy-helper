
CREATE OR REPLACE FUNCTION public.audit_secdef_anon_regression()
RETURNS TABLE(leaked_signature text, inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_caller_is_admin boolean;
  v_sig text;
  v_recent uuid;
  v_new_id uuid;
BEGIN
  -- Guard: allow service_role and admins only. auth.uid()=NULL implies
  -- superuser/cron context (search_path=public, called via cron.schedule).
  IF auth.uid() IS NOT NULL THEN
    SELECT public.has_role(auth.uid(), 'admin'::app_role) INTO v_caller_is_admin;
    IF NOT COALESCE(v_caller_is_admin, false) THEN
      RAISE EXCEPTION 'audit_secdef_anon_regression: forbidden'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR v_sig IN
    SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
    ORDER BY 1
  LOOP
    -- Dedup: skip if same signature already logged in last 24h.
    SELECT id INTO v_recent
    FROM public.monitor_alerts_log
    WHERE source = 'secdef_audit'
      AND alert_signature = 'secdef_audit|' || v_sig
      AND triggered_at > now() - interval '24 hours'
    LIMIT 1;

    IF v_recent IS NOT NULL THEN
      leaked_signature := v_sig;
      inserted := false;
      RETURN NEXT;
      CONTINUE;
    END IF;

    INSERT INTO public.monitor_alerts_log (
      alert_signature, error_count, affected_users,
      sample_message, sample_route, source, details, notified, notified_email
    ) VALUES (
      'secdef_audit|' || v_sig,
      1, 0,
      'SECURITY DEFINER anon regression: ' || v_sig,
      NULL,
      'secdef_audit',
      jsonb_build_object('function_signature', v_sig, 'severity', 'critical'),
      false, false
    )
    RETURNING id INTO v_new_id;

    leaked_signature := v_sig;
    inserted := true;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.audit_secdef_anon_regression() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_secdef_anon_regression() TO service_role;

-- Daily cron 03:00 UTC.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'audit-secdef-anon-regression-daily') THEN
    PERFORM cron.unschedule('audit-secdef-anon-regression-daily');
  END IF;
  PERFORM cron.schedule(
    'audit-secdef-anon-regression-daily',
    '0 3 * * *',
    $cron$SELECT public.audit_secdef_anon_regression();$cron$
  );
END
$do$;
