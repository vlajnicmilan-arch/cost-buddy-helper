/**
 * Update Telemetry
 *
 * Fire-and-forget logger for the app-update lifecycle. Wraps `logDiagnostic`
 * so we never throw out of the update flow even if Supabase is down.
 *
 * Events (Faza 4 §3):
 * - update_check_performed
 * - update_dialog_shown
 * - update_user_accepted
 * - update_user_declined
 * - update_download_started
 * - update_download_completed
 * - update_download_failed
 * - update_checksum_failed
 * - update_install_intent_launched
 * - update_install_completed (detected on next boot)
 */
import { logDiagnostic } from '@/lib/diagnosticLogger';

export type UpdateEvent =
  | 'update_check_performed'
  | 'update_dialog_shown'
  | 'update_user_accepted'
  | 'update_user_declined'
  | 'update_download_started'
  | 'update_download_completed'
  | 'update_download_failed'
  | 'update_checksum_failed'
  | 'update_install_intent_launched'
  | 'update_install_completed';

export const logUpdateEvent = (
  event: UpdateEvent,
  details?: Record<string, unknown>
): void => {
  try {
    logDiagnostic({
      event,
      details: details ?? {},
      severity: event.includes('failed') ? 'error' : 'info',
    });
  } catch (err) {
    // Telemetry MUST NEVER break the update flow
    console.warn('[UpdateTelemetry] log failed:', err);
  }
};
