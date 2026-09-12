/**
 * Zajednički omotač za dohvate koji se pokreću pri otvaranju ekrana.
 *
 * Kratki ispad poslužitelja (Supabase incident, "Failed to fetch") ne smije
 * korisniku odmah proizvesti crvenu poruku: dohvat se tiho ponavlja kroz
 * postojeći `runWithTransientRetry` (3 pokušaja, 1 s / 3 s), a poruka se
 * pokazuje tek kad su ponavljanja iscrpljena.
 *
 * Dijagnostika:
 *  - `<ime>_fetch_retried` (info) kad se dohvat oporavio nakon ponavljanja
 *  - `<ime>_fetch_failed`  (error) kad su ponavljanja iscrpljena
 */
import {
  runWithTransientRetry,
  classifyFetchFailure,
  type FetchFailureInfo,
} from '@/lib/expenseFetchRetry';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { getBuildStamp } from '@/lib/buildStamp';
import { tr } from '@/lib/errorMessages';

/** Poruka koju korisnik vidi TEK nakon iscrpljenih ponavljanja. */
export const NETWORK_FETCH_FALLBACK = 'Nema veze s poslužiteljem — podaci nisu osvježeni';

/**
 * Pokreće `fn` uz prolazni retry i dijagnostiku. Konačni pad se baca dalje,
 * pa pozivatelj (hook) odlučuje o poruci i NE briše podatke s ekrana.
 */
export async function loadWithRetry<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const { result, attempts } = await runWithTransientRetry(fn);
    if (attempts > 1) {
      logDiagnostic({
        event: `${name}_fetch_retried`,
        severity: 'info',
        details: {
          cause: 'recovered',
          attempts,
          duration_ms: Date.now() - startedAt,
        },
      });
    }
    return result;
  } catch (error) {
    const info = classifyFetchFailure(error);
    logDiagnostic({
      event: `${name}_fetch_failed`,
      severity: 'error',
      details: {
        cause: info.kind,
        http_status: info.status ?? null,
        message: (info.message || '').slice(0, 200),
        duration_ms: Date.now() - startedAt,
        build: getBuildStamp(),
      },
    });
    throw error;
  }
}

/** Ljudska poruka za konačni pad: mrežni uzrok dobiva svoj tekst. */
export function fetchFailureMessage(error: unknown, fallback: string): string {
  const info: FetchFailureInfo = classifyFetchFailure(error);
  if (info.kind === 'network' || info.kind === 'timeout') {
    return tr('errors.fetch.serverUnavailable', NETWORK_FETCH_FALLBACK);
  }
  return fallback;
}
