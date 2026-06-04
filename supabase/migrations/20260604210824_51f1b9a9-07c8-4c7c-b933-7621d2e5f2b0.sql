
-- ============================================================================
-- Wave 1.5: A3 retraction (autor: shared+predlozena → personal, krug_id ostaje)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.krug_retract(
  p_expense_id uuid,
  p_client_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _viewer uuid := auth.uid();
  _exp record;
  _outcome text;
  _dedup_hit record;
BEGIN
  IF _viewer IS NULL THEN
    RETURN jsonb_build_object('outcome','unauthenticated');
  END IF;

  IF coalesce(p_client_request_id,'') = '' THEN
    RETURN jsonb_build_object('outcome','missing_client_request_id');
  END IF;

  SELECT outcome INTO _dedup_hit
  FROM public.krug_act_dedup
  WHERE user_id = _viewer
    AND expense_id = p_expense_id
    AND act = 'A3'
    AND client_request_id = p_client_request_id
    AND created_at > now() - interval '24 hours'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('outcome', _dedup_hit.outcome, 'expense_id', p_expense_id, 'replayed', true);
  END IF;

  SELECT id, user_id, krug_id, krug_privacy, krug_shared_status, deleted_at
    INTO _exp
  FROM public.expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND OR _exp.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('outcome','not_found','expense_id',p_expense_id);
  END IF;

  IF _exp.user_id <> _viewer THEN
    RETURN jsonb_build_object('outcome','not_author','expense_id',_exp.id);
  END IF;

  IF _exp.krug_id IS NULL OR _exp.krug_privacy <> 'shared'::public.krug_privacy THEN
    RETURN jsonb_build_object('outcome','not_in_shared_flow','expense_id',_exp.id);
  END IF;

  IF NOT public.krug_is_full_member(_exp.krug_id, _viewer) THEN
    RETURN jsonb_build_object('outcome','not_full_member','expense_id',_exp.id);
  END IF;

  IF _exp.krug_shared_status <> 'predlozena'::public.krug_shared_status THEN
    RETURN jsonb_build_object('outcome','wrong_state','expense_id',_exp.id,'previous_status',_exp.krug_shared_status);
  END IF;

  UPDATE public.expenses
     SET krug_privacy = 'personal'::public.krug_privacy,
         krug_shared_status = NULL,
         updated_at = now()
   WHERE id = _exp.id;

  _outcome := 'ok_retracted';

  INSERT INTO public.krug_act_dedup(user_id, expense_id, act, client_request_id, outcome)
  VALUES (_viewer, _exp.id, 'A3', p_client_request_id, _outcome)
  ON CONFLICT (user_id, expense_id, act, client_request_id) DO NOTHING;

  RETURN jsonb_build_object('outcome',_outcome,'expense_id',_exp.id,'krug_id',_exp.krug_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_retract(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_retract(uuid, text) TO authenticated, service_role;

-- ============================================================================
-- Wave 1.5: A7 governance shared → personal (punopravni član;
-- briše krug_shared_status, krug_id OSTAJE — krug_id→NULL je post-delete, ne A7)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.krug_govern_to_personal(
  p_expense_id uuid,
  p_client_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _viewer uuid := auth.uid();
  _exp record;
  _outcome text;
  _dedup_hit record;
BEGIN
  IF _viewer IS NULL THEN
    RETURN jsonb_build_object('outcome','unauthenticated');
  END IF;

  IF coalesce(p_client_request_id,'') = '' THEN
    RETURN jsonb_build_object('outcome','missing_client_request_id');
  END IF;

  SELECT outcome INTO _dedup_hit
  FROM public.krug_act_dedup
  WHERE user_id = _viewer
    AND expense_id = p_expense_id
    AND act = 'A7'
    AND client_request_id = p_client_request_id
    AND created_at > now() - interval '24 hours'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('outcome',_dedup_hit.outcome,'expense_id',p_expense_id,'replayed',true);
  END IF;

  SELECT id, user_id, krug_id, krug_privacy, krug_shared_status, deleted_at
    INTO _exp
  FROM public.expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND OR _exp.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('outcome','not_found','expense_id',p_expense_id);
  END IF;

  IF _exp.krug_id IS NULL OR _exp.krug_privacy <> 'shared'::public.krug_privacy THEN
    RETURN jsonb_build_object('outcome','not_in_shared_flow','expense_id',_exp.id);
  END IF;

  IF NOT public.krug_is_full_member(_exp.krug_id, _viewer) THEN
    RETURN jsonb_build_object('outcome','not_full_member','expense_id',_exp.id);
  END IF;

  -- A7 djeluje samo na riješena (post-quorum) stanja, ne na predlozena.
  IF _exp.krug_shared_status NOT IN (
       'potvrdjena'::public.krug_shared_status,
       'nepotvrdjena'::public.krug_shared_status
     ) THEN
    RETURN jsonb_build_object('outcome','wrong_state','expense_id',_exp.id,'previous_status',_exp.krug_shared_status);
  END IF;

  UPDATE public.expenses
     SET krug_privacy = 'personal'::public.krug_privacy,
         krug_shared_status = NULL,
         updated_at = now()
   WHERE id = _exp.id;

  _outcome := 'ok_governed_to_personal';

  INSERT INTO public.krug_act_dedup(user_id, expense_id, act, client_request_id, outcome)
  VALUES (_viewer, _exp.id, 'A7', p_client_request_id, _outcome)
  ON CONFLICT (user_id, expense_id, act, client_request_id) DO NOTHING;

  RETURN jsonb_build_object('outcome',_outcome,'expense_id',_exp.id,'krug_id',_exp.krug_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_govern_to_personal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.krug_govern_to_personal(uuid, text) TO authenticated, service_role;

-- ============================================================================
-- Wave 1.5: A6 — 48h auto-expiry za shared+predlozena → nepotvrdjena (sustavski akt)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.krug_expire_predlozena()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  WITH expired AS (
    UPDATE public.expenses
       SET krug_shared_status = 'nepotvrdjena'::public.krug_shared_status,
           updated_at = now()
     WHERE krug_id IS NOT NULL
       AND krug_privacy = 'shared'::public.krug_privacy
       AND krug_shared_status = 'predlozena'::public.krug_shared_status
       AND deleted_at IS NULL
       AND created_at < now() - interval '48 hours'
     RETURNING id
  )
  SELECT count(*) INTO _count FROM expired;

  RETURN jsonb_build_object('expired', _count, 'at', now());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_expire_predlozena() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.krug_expire_predlozena() TO service_role;

-- ============================================================================
-- Wave 1.5: dedup cleanup — briše krug_act_dedup starije od 24h
-- ============================================================================
CREATE OR REPLACE FUNCTION public.krug_cleanup_act_dedup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.krug_act_dedup
     WHERE created_at < now() - interval '24 hours'
     RETURNING id
  )
  SELECT count(*) INTO _count FROM deleted;

  RETURN jsonb_build_object('deleted', _count, 'at', now());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.krug_cleanup_act_dedup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.krug_cleanup_act_dedup() TO service_role;

-- ============================================================================
-- Cron: A6 expiry svakih 15 min, dedup cleanup jednom dnevno (03:30 UTC)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('krug-expire-predlozena');
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('krug-cleanup-act-dedup');
EXCEPTION WHEN others THEN NULL;
END $$;

SELECT cron.schedule(
  'krug-expire-predlozena',
  '*/15 * * * *',
  $cron$ SELECT public.krug_expire_predlozena(); $cron$
);

SELECT cron.schedule(
  'krug-cleanup-act-dedup',
  '30 3 * * *',
  $cron$ SELECT public.krug_cleanup_act_dedup(); $cron$
);
