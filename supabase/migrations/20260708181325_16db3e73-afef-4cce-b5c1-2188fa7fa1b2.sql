-- WS3a-1: enqueue_worker_payout_notifications now writes i18n keys + vars
-- instead of pre-rendered HR strings. Client-side resolveNotificationText
-- and send-push translator resolve them to the recipient's language.
--
-- BALANCE-LOGIC IMPACT: none. Only notification text authoring changes.
-- Deep-link fields (worker_attribution_expense_id, batch_id, payout_ids,
-- project_ids, project_names, paid_amount_total, action, source) preserved
-- verbatim in `data`.
--
-- Fallback for old rows: resolveNotificationText already returns raw text
-- when title/message don't match the i18n-key pattern, so pre-existing
-- HR-language rows stay readable.

CREATE OR REPLACE FUNCTION public.enqueue_worker_payout_notifications(
  p_payout_ids uuid[],
  p_action     text,
  p_actor      uuid,
  p_batch_id   uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivered integer := 0;
  v_rec RECORD;
  v_project_names text[];
  v_project_ids uuid[];
  v_payout_ids uuid[];
  v_total numeric;
  v_amount_fmt text;
  v_title_key text;
  v_message_key text;
  v_title_vars jsonb;
  v_message_vars jsonb;
  v_period_start date;
  v_period_end date;
  v_single_project text;
  v_row_count integer;
  v_attribution_expense uuid;
  v_data jsonb;
  v_project_names_joined text;
BEGIN
  IF p_payout_ids IS NULL OR array_length(p_payout_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_rec IN
    SELECT w.user_id AS recipient
    FROM public.project_worker_payouts pw
    JOIN public.project_workers w ON w.id = pw.worker_id
    WHERE pw.id = ANY(p_payout_ids)
      AND w.user_id IS NOT NULL
      AND (p_actor IS NULL OR w.user_id <> p_actor)
    GROUP BY w.user_id
  LOOP
    SELECT
      array_agg(DISTINCT p.name),
      array_agg(DISTINCT pw.project_id),
      array_agg(pw.id),
      SUM(pw.paid_amount),
      MIN(pw.period_start),
      MAX(pw.period_end),
      COUNT(*)
    INTO
      v_project_names, v_project_ids, v_payout_ids, v_total, v_period_start, v_period_end, v_row_count
    FROM public.project_worker_payouts pw
    JOIN public.project_workers w ON w.id = pw.worker_id
    JOIN public.projects p ON p.id = pw.project_id
    WHERE pw.id = ANY(p_payout_ids)
      AND w.user_id = v_rec.recipient;

    -- Formatted amount used for display; keep server locale-neutral (dot
    -- decimal). Client localises via t() vars — this is the {{amount}} value.
    v_amount_fmt := to_char(COALESCE(v_total,0), 'FM999G999G990D00') || ' EUR';
    v_single_project := CASE WHEN array_length(v_project_names,1) = 1 THEN v_project_names[1] ELSE NULL END;
    v_project_names_joined := array_to_string(v_project_names, ', ');

    IF p_action = 'created' THEN
      IF v_row_count = 1 THEN
        v_title_key := 'notifications.worker_payout.created.single.title';
        v_message_key := 'notifications.worker_payout.created.single.message';
        v_title_vars := jsonb_build_object('project', COALESCE(v_single_project, ''));
        v_message_vars := jsonb_build_object(
          'amount', v_amount_fmt,
          'period_start', v_period_start,
          'period_end', v_period_end
        );
      ELSE
        v_title_key := 'notifications.worker_payout.created.batch.title';
        v_message_key := 'notifications.worker_payout.created.batch.message';
        v_title_vars := jsonb_build_object('count', array_length(v_project_names,1));
        v_message_vars := jsonb_build_object(
          'amount', v_amount_fmt,
          'count', array_length(v_project_names,1),
          'project_names', v_project_names_joined
        );
      END IF;
    ELSE
      IF v_row_count = 1 THEN
        v_title_key := 'notifications.worker_payout.voided.single.title';
        v_message_key := 'notifications.worker_payout.voided.single.message';
        v_title_vars := jsonb_build_object('project', COALESCE(v_single_project, ''));
        v_message_vars := jsonb_build_object(
          'amount', v_amount_fmt,
          'period_start', v_period_start,
          'period_end', v_period_end
        );
      ELSE
        v_title_key := 'notifications.worker_payout.voided.batch.title';
        v_message_key := 'notifications.worker_payout.voided.batch.message';
        v_title_vars := jsonb_build_object('count', array_length(v_project_names,1));
        v_message_vars := jsonb_build_object(
          'amount', v_amount_fmt,
          'count', array_length(v_project_names,1)
        );
      END IF;
    END IF;

    v_data := jsonb_build_object(
      'batch_id', p_batch_id,
      'payout_ids', to_jsonb(v_payout_ids),
      'project_ids', to_jsonb(v_project_ids),
      'project_names', to_jsonb(v_project_names),
      'paid_amount_total', v_total,
      'action', p_action,
      'source', 'server',
      'title_vars', v_title_vars,
      'message_vars', v_message_vars
    );

    IF p_action = 'voided' THEN
      v_attribution_expense := NULL;
      IF p_batch_id IS NOT NULL THEN
        SELECT id INTO v_attribution_expense
          FROM public.expenses
         WHERE user_id = v_rec.recipient
           AND worker_payout_batch_id = p_batch_id
           AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1;
      END IF;
      IF v_attribution_expense IS NULL THEN
        SELECT id INTO v_attribution_expense
          FROM public.expenses
         WHERE user_id = v_rec.recipient
           AND worker_payout_id = ANY(v_payout_ids)
           AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1;
      END IF;
      IF v_attribution_expense IS NOT NULL THEN
        v_data := v_data || jsonb_build_object(
          'worker_attribution_expense_id', v_attribution_expense
        );
      END IF;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      v_rec.recipient,
      CASE WHEN p_action = 'created' THEN 'worker_payout_created' ELSE 'worker_payout_voided' END,
      v_title_key,
      v_message_key,
      v_data
    );
    v_delivered := v_delivered + 1;
  END LOOP;

  RETURN v_delivered;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_worker_payout_notifications(uuid[], text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_worker_payout_notifications(uuid[], text, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.enqueue_worker_payout_notifications(uuid[], text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_worker_payout_notifications(uuid[], text, uuid, uuid) TO service_role;