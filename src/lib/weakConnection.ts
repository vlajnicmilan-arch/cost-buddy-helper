/**
 * Jedna tiha traka umjesto niza crvenih poruka.
 *
 * Dok bilo koji dohvat Početne tiho ponavlja pokušaj (prolazna mrežna
 * greška, istekao rok), ovdje se bilježi da veza "škripi". Traka
 * "Veza je slaba — osvježavam…" prikaže se jednom, bez obzira na broj
 * dohvata, i nestane čim posljednji dohvat završi. Za to vrijeme pojedinačne
 * mrežne obavijesti se potiskuju (vidi `useStatusFeedback`).
 *
 * Dijagnostika: `weak_connection_shown` / `weak_connection_recovered`.
 */

export interface WeakConnectionState {
  /** Traka je vidljiva dok bar jedan dohvat ponavlja pokušaj. */
  active: boolean;
  /** Koliko dohvata trenutno čeka. */
  pending: number;
}

const waiting = new Set<string>();
let startedAt = 0;
/** Koliko je različitih dohvata ušlo u ponavljanje u trenutnoj epizodi. */
let episodeFetches = 0;
let state: WeakConnectionState = { active: false, pending: 0 };

const listeners = new Set<(s: WeakConnectionState) => void>();

/** Dijagnostika je best-effort i učitava se lijeno (modul povlači supabase). */
function log(event: string, details: Record<string, unknown>) {
  void import('@/lib/diagnosticLogger')
    .then(({ logDiagnostic }) => logDiagnostic({ event, severity: 'info', details }))
    .catch(() => {
      /* best-effort */
    });
}

function emit() {
  state = { active: waiting.size > 0, pending: waiting.size };
  listeners.forEach((l) => l(state));
}

export function getWeakConnectionState(): WeakConnectionState {
  return state;
}

export function isWeakConnectionActive(): boolean {
  return state.active;
}

export function subscribeWeakConnection(listener: (s: WeakConnectionState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Dohvat je ušao u prolazno ponavljanje. */
export function beginWeakFetch(name: string) {
  const wasActive = waiting.size > 0;
  if (!waiting.has(name)) episodeFetches += 1;
  waiting.add(name);
  if (!wasActive) {
    startedAt = Date.now();
    log('weak_connection_shown', { fetch: name, waiting: waiting.size });
  }
  emit();
}

/** Dohvat je završio — uspjehom ili konačnim padom. */
export function endWeakFetch(name: string, outcome: 'recovered' | 'failed' = 'recovered') {
  if (!waiting.has(name)) return;
  waiting.delete(name);
  if (waiting.size === 0) {
    log('weak_connection_recovered', {
      outcome,
      fetches: episodeFetches,
      duration_ms: startedAt ? Date.now() - startedAt : 0,
    });
    episodeFetches = 0;
    startedAt = 0;
  }
  emit();
}

/** Testna pomoćna funkcija. */
export function __resetWeakConnection() {
  waiting.clear();
  episodeFetches = 0;
  startedAt = 0;
  state = { active: false, pending: 0 };
  listeners.clear();
}
