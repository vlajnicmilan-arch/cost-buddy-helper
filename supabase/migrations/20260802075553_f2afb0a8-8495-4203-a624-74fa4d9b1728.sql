-- 1) REVOKE anon EXECUTE na funkcijama dodanima u koraku E.
REVOKE EXECUTE ON FUNCTION public.review_project_expense(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_reject_expired_pending_expenses(interval) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_project_expense(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_reject_expired_pending_expenses(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_project_expense(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_project_expense(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_reject_expired_pending_expenses(interval) TO service_role;

-- 2) Unutarnja brana za cron funkciju (defense-in-depth, ne oslanja se samo na grantove).
--    Tijelo je preslika žive definicije (pg_get_functiondef) + guard na početku.
CREATE OR REPLACE FUNCTION public.auto_reject_expired_pending_expenses(p_older_than interval DEFAULT '24:00:00'::interval)
 RETURNS TABLE(id uuid, description text, submitted_by uuid, user_id uuid, project_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Masovna izmjena bez provjere pozivatelja po prirodi posla → smije je pokrenuti
  -- samo pozadinski posao (pg_cron radi kao postgres) ili service_role.
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'auto_reject_expired_pending_expenses is a background job (service_role/cron only)'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.expense_reviewer', 'rpc', true);

  RETURN QUERY
  UPDATE public.expenses e
     SET status = 'rejected'::transaction_status,
         rejection_reason = 'auto_reject_expired',
         reviewed_at = now()
   WHERE e.status = 'pending'::transaction_status
     AND e.created_at < now() - p_older_than
     AND e.deleted_at IS NULL
  RETURNING e.id, e.description, e.submitted_by, e.user_id, e.project_id;

  PERFORM set_config('app.expense_reviewer', '', true);
END;
$function$;

-- CREATE OR REPLACE ne dira postojeći ACL, ali ponavljamo revoke radi eksplicitnosti.
REVOKE EXECUTE ON FUNCTION public.auto_reject_expired_pending_expenses(interval) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_reject_expired_pending_expenses(interval) TO service_role;