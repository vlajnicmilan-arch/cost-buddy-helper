-- Add severity column to app_diagnostics_logs for prioritized error tracking
ALTER TABLE public.app_diagnostics_logs
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info'
  CHECK (severity IN ('critical', 'error', 'warning', 'info'));

-- Partial index — fast queries for important events only
CREATE INDEX IF NOT EXISTS idx_app_diag_severity_time
  ON public.app_diagnostics_logs (severity, created_at DESC)
  WHERE severity IN ('critical', 'error', 'warning');

-- Backfill existing rows based on event name
UPDATE public.app_diagnostics_logs
SET severity = CASE
  WHEN event IN ('window_error', 'unhandled_rejection', 'react_error_boundary', 'supabase_error', 'edge_function_error', 'notify_invoke_http_error') THEN 'error'
  WHEN event = 'performance_metric' AND COALESCE((details->>'duration_ms')::numeric, 0) > 5000 THEN 'warning'
  ELSE 'info'
END
WHERE severity = 'info';