/**
 * BRIEF-VRATA — zapis izlaza koji se dogode PRIJE ekrana (0 ms filter).
 *
 * Korisnikov prekidac i pravilo ucestalosti sprijece ulazak na /brief, pa ih
 * sam ekran ne moze zabiljeziti. Zapis ide najvise jednom po pokretanju
 * aplikacije i nikad ne baca.
 */
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { COMMIT_SHA } from '@/lib/version';
import { BRIEF_GATE_EXIT_EVENT, buildBriefExitDetails } from './exitTelemetry';

let logged = false;

/** Samo za testove. */
export function resetGateSkipLog(): void {
  logged = false;
}

export function logGateSkip(reason: 'user_disabled' | 'frequency_blocked'): void {
  if (logged) return;
  logged = true;
  try {
    logDiagnostic(
      BRIEF_GATE_EXIT_EVENT,
      buildBriefExitDetails({ reason, elapsedMs: 0, rpcMs: null, snapshot: null, messagesCount: 0, build: COMMIT_SHA }),
    );
  } catch {
    /* mjerenje ne smije rusiti ulazak */
  }
}
