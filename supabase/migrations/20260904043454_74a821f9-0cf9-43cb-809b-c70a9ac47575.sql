ALTER TABLE public.account_deletion_log ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE OR REPLACE FUNCTION public.admin_accounts_emptiness(p_user_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  housekeeping text[] := ARRAY[
    'profiles','user_roles','terms_acceptances','newsletter_consents',
    'notification_preferences','user_login_logs','funnel_events',
    'dashboard_telemetry','app_diagnostics_logs','free_tier_usage_monthly',
    'core_scan_usage','ai_usage_daily','ai_usage_monthly','push_tokens',
    'push_delivery_logs','notifications','activation_nudge_log',
    'account_deletion_log','user_entitlements','user_subscriptions'
  ];
  rec record;
  checked text[] := '{}';
  counts jsonb := '{}'::jsonb;
  row_counts jsonb;
  result jsonb := '{}'::jsonb;
  uid uuid;
  blockers jsonb;
  paid int;
BEGIN
  PERFORM public._require_admin();

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('checked_tables', '[]'::jsonb, 'accounts', '{}'::jsonb);
  END IF;

  FOR rec IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
     AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'user_id'
      AND NOT (c.table_name = ANY (housekeeping))
    ORDER BY c.table_name
  LOOP
    checked := checked || rec.table_name;
    EXECUTE format(
      'SELECT coalesce(jsonb_object_agg(user_id::text, n), ''{}''::jsonb)
         FROM (SELECT user_id, count(*) AS n FROM public.%I
               WHERE user_id = ANY($1) GROUP BY user_id) s',
      rec.table_name
    ) INTO row_counts USING p_user_ids;

    IF row_counts <> '{}'::jsonb THEN
      counts := counts || jsonb_build_object(rec.table_name, row_counts);
    END IF;
  END LOOP;

  FOREACH uid IN ARRAY p_user_ids LOOP
    blockers := '[]'::jsonb;

    SELECT coalesce(jsonb_agg(jsonb_build_object('table', key, 'count', (value ->> uid::text)::bigint)
                              ORDER BY key), '[]'::jsonb)
      INTO blockers
      FROM jsonb_each(counts)
     WHERE value ? uid::text;

    SELECT count(*) INTO paid
      FROM public.user_entitlements
     WHERE user_id = uid
       AND source = 'paddle'
       AND coalesce(status, '') NOT IN ('canceled', 'cancelled', 'expired', 'deleted');

    IF paid > 0 THEN
      blockers := blockers || jsonb_build_array(
        jsonb_build_object('table', 'user_entitlements', 'count', paid, 'kind', 'paid_subscription')
      );
    END IF;

    result := result || jsonb_build_object(
      uid::text,
      jsonb_build_object(
        'empty', jsonb_array_length(blockers) = 0,
        'blockers', blockers,
        'is_admin', public.has_role(uid, 'admin'),
        'is_self', uid = auth.uid()
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'checked_tables', to_jsonb(checked),
    'checked_count', coalesce(array_length(checked, 1), 0),
    'checked_at', now(),
    'accounts', result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_account_emptiness(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  batch jsonb;
BEGIN
  batch := public.admin_accounts_emptiness(ARRAY[p_user_id]);
  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'checked_tables', batch -> 'checked_tables',
    'checked_count', batch -> 'checked_count',
    'checked_at', batch -> 'checked_at'
  ) || coalesce(batch -> 'accounts' -> p_user_id::text, '{}'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_accounts_emptiness(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_account_emptiness(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_accounts_emptiness(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_account_emptiness(uuid) TO authenticated, service_role;