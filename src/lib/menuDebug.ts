import { logDiagnostic } from '@/lib/diagnosticLogger';

// TEMPORARY — REMOVE AFTER BUG DIAGNOSIS
export const MENU_DEBUG_ENABLED = true;

let menuDebugSequence = 0;

/** TEMPORARY — REMOVE AFTER BUG DIAGNOSIS */
export const logMenuDebug = (event: string, payload: object): void => {
  if (!MENU_DEBUG_ENABLED) return;

  try {
    const timestampMs = Date.now();
    menuDebugSequence += 1;
    logDiagnostic('menu_debug', {
      context: 'menu_debug',
      menu_event: event,
      timestamp_ms: timestampMs,
      // `action` is part of diagnosticLogger's dedup signature. Keep every
      // temporary event as an individual row while preserving its event name.
      action: `${event}:${timestampMs}:${menuDebugSequence}`,
      payload,
    });
  } catch {
    // TEMPORARY diagnostics must never affect the UI.
  }
};