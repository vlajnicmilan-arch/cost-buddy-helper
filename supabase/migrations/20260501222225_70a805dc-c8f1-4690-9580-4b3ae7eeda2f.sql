
-- 1) Backfill: poveži workera "Test Test" s user_id Testa preko prihvaćene pozivnice s worker_id
UPDATE public.project_workers pw
SET user_id = pi.invited_user_id
FROM public.project_invitations pi
WHERE pi.worker_id = pw.id
  AND pi.status = 'accepted'
  AND pi.invited_user_id IS NOT NULL
  AND pw.user_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.project_workers pw2
    WHERE pw2.project_id = pw.project_id
      AND pw2.user_id = pi.invited_user_id
      AND pw2.id <> pw.id
  );

-- 2) Backfill: za sve postojeće work_logs s hours, kreiraj/azuriraj odgovarajuci project_work_entries zapis
INSERT INTO public.project_work_entries (
  worker_id, project_id, work_date, scheduled_hours, actual_hours, note, milestone_ids, business_profile_id
)
SELECT
  pw.id,
  wl.project_id,
  wl.log_date,
  wl.hours,
  wl.hours,
  wl.summary,
  CASE WHEN wl.milestone_id IS NULL THEN NULL ELSE ARRAY[wl.milestone_id] END,
  pw.business_profile_id
FROM public.project_work_logs wl
JOIN public.project_workers pw
  ON pw.project_id = wl.project_id AND pw.user_id = wl.user_id
WHERE wl.hours IS NOT NULL
ON CONFLICT (worker_id, work_date) DO UPDATE
SET actual_hours = EXCLUDED.actual_hours,
    scheduled_hours = EXCLUDED.scheduled_hours,
    note = COALESCE(EXCLUDED.note, public.project_work_entries.note),
    updated_at = now();
