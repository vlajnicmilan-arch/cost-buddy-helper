-- PR1 follow-up: daily flush cron for participant digest
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'flush-participant-digest-daily') THEN
    PERFORM cron.unschedule('flush-participant-digest-daily');
  END IF;

  PERFORM cron.schedule(
    'flush-participant-digest-daily',
    -- 19:00 UTC ≈ 20:00 HR (zima) / 21:00 HR (ljeto). Quiet-hours safe.
    '0 19 * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/flush-participant-digest',
      headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6YWx4anJldHZ0dm9raW90dmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMjczNDMsImV4cCI6MjA4NDYwMzM0M30.NKPTQ5hJnMt7M17NUPLNU07CQ3EFZZpOrE2ZQvuEtTw"}'::jsonb,
      body := jsonb_build_object('triggered_at', now())
    );
    $cron$
  );
END $$;

-- Service-role helper: atomically drains pending events for a (user, project) row.
-- Vraca pending_summary + count, i resetira state na 0/[]/last_sent_at=now().
CREATE OR REPLACE FUNCTION public.drain_participant_digest(p_user_id uuid, p_project_id uuid)
RETURNS TABLE (pending_count integer, pending_summary jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_summary jsonb;
BEGIN
  UPDATE public.participant_digest_state
     SET pending_count = 0,
         pending_summary = '[]'::jsonb,
         last_sent_at = now(),
         updated_at = now()
   WHERE user_id = p_user_id
     AND project_id = p_project_id
   RETURNING participant_digest_state.pending_count, participant_digest_state.pending_summary
       INTO v_count, v_summary;
  -- vrati prijašnje stanje (prije UPDATE-a) — Postgres RETURNING vraca NOVO stanje,
  -- pa moramo prethodno citati. Refactor: koristimo CTE.
  RETURN;
END;
$$;

-- Pravilna verzija: read-then-reset preko CTE
CREATE OR REPLACE FUNCTION public.drain_participant_digest(p_user_id uuid, p_project_id uuid)
RETURNS TABLE (pending_count integer, pending_summary jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH snapshot AS (
    SELECT pending_count, pending_summary
      FROM public.participant_digest_state
     WHERE user_id = p_user_id
       AND project_id = p_project_id
     FOR UPDATE
  ), reset AS (
    UPDATE public.participant_digest_state
       SET pending_count = 0,
           pending_summary = '[]'::jsonb,
           last_sent_at = now(),
           updated_at = now()
     WHERE user_id = p_user_id
       AND project_id = p_project_id
    RETURNING 1
  )
  SELECT snapshot.pending_count, snapshot.pending_summary
    FROM snapshot, reset;
$$;

REVOKE EXECUTE ON FUNCTION public.drain_participant_digest(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.drain_participant_digest(uuid, uuid) TO service_role;
