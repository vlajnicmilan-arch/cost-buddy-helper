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
import { withTimeoutAndDrain, HOME_FETCH_TIMEOUT_MS } from '@/lib/fetchTimeout';
import { beginWeakFetch, endWeakFetch } from '@/lib/weakConnection';
import {
  getTokenReadyAt,
  startedBeforeTokenReady,
  subscribeTokenRefresh,
  tokenAgeSeconds,
  waitedForAuthMs,
  StaleTokenError,
} from '@/lib/authTokenReady';
import i18next from 'i18next';

const inFlightLoads = new Map<string, Promise<unknown>>();

/**
 * Spaja istovremene zahtjeve istog imena. Pozivatelji dijele isti rezultat,
 * pa fokus, ručno osvježavanje i retry ne mogu otvoriti paralelne kopije.
 */
export function runSingleFlight<T>(name: string, load: () => Promise<T>): Promise<T> {
  const current = inFlightLoads.get(name) as Promise<T> | undefined;
  if (current) return current;

  const promise = load().finally(() => {
    if (inFlightLoads.get(name) === promise) inFlightLoads.delete(name);
  });
  inFlightLoads.set(name, promise);
  return promise;
}

export function __resetInFlightLoadsForTests(): void {
  inFlightLoads.clear();
}

/** Poruka koju korisnik vidi TEK nakon iscrpljenih ponavljanja. */
export const NETWORK_FETCH_FALLBACK = 'Nema veze s poslužiteljem — podaci nisu osvježeni';

/**
 * Siguran prijevod bez uvoza @/i18n: u testovima i18next nije inicijaliziran
 * i ne smije se inicijalizirati (lanac @/lib/errorMessages → @/i18n to radi).
 */
function trSafe(key: string, defaultValue: string): string {
  return i18next.isInitialized ? i18next.t(key, { defaultValue }) : defaultValue;
}

/**
 * Pokreće `fn` uz prolazni retry i dijagnostiku. Konačni pad se baca dalje,
 * pa pozivatelj (hook) odlučuje o poruci i NE briše podatke s ekrana.
 */
export async function loadWithRetry<T>(
  name: string,
  fn: (signal: AbortSignal) => Promise<T>,
  options: { timeoutMs?: number; singleFlightKey?: string } = {},
): Promise<T> {
  // `name` ostaje ime za dijagnostiku; ključ spajanja smije biti uži
  // (npr. korisnik + poslovni profil) da se dohvati različitih dosega
  // ne gutaju međusobno.
  const key = options.singleFlightKey ?? name;
  return runSingleFlight(key, () => loadWithRetryInternal(name, fn, options));
}

async function loadWithRetryInternal<T>(
  name: string,
  fn: (signal: AbortSignal) => Promise<T>,
  options: { timeoutMs?: number },
): Promise<T> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? HOME_FETCH_TIMEOUT_MS;
  let weak = false;
  let preAuthRetry = false;
  try {
    const { result, attempts } = await runWithTransientRetry(
      () =>
        withTimeoutAndDrain(fn, timeoutMs, {
          // Zahtjev poslan prije nego je token bio spreman ne čeka rok:
          // čim se token osvježi, prekidamo ga i ponavljamo s novim.
          cancel:
            getTokenReadyAt() === null
              ? (trigger) => subscribeTokenRefresh(() => trigger(new StaleTokenError()))
              : undefined,
        }),
      {
        // Pad zbog starog tokena ponavlja se odmah, bez razmaka.
        sleep: (ms) =>
          startedBeforeTokenReady(startedAt)
            ? Promise.resolve()
            : new Promise<void>((r) => setTimeout(r, ms)),
        onRetry: () => {
          if (startedBeforeTokenReady(startedAt)) {
            // Nije mrežni problem — samo smo pretekli osvježenje tokena.
            preAuthRetry = true;
            return;
          }
          // Prvo ponavljanje pali JEDNU tihu traku umjesto crvene poruke.
          weak = true;
          beginWeakFetch(name);
        },
      },
    );
    if (weak) endWeakFetch(name, 'recovered');
    if (attempts > 1) {
      logDiagnostic({
        event: `${name}_fetch_retried`,
        severity: 'info',
        details: {
          cause: 'recovered',
          attempts,
          duration_ms: Date.now() - startedAt,
          pre_auth: preAuthRetry,
          waited_for_auth_ms: waitedForAuthMs(startedAt),
          token_age_s: tokenAgeSeconds(),
        },
      });
    }
    return result;
  } catch (error) {
    if (weak) endWeakFetch(name, 'failed');
    const info = classifyFetchFailure(error);
    logDiagnostic({
      event: `${name}_fetch_failed`,
      severity: 'error',
      details: {
        cause: info.kind,
        http_status: info.status ?? null,
        message: (info.message || '').slice(0, 200),
        duration_ms: Date.now() - startedAt,
        waited_for_auth_ms: waitedForAuthMs(startedAt),
        token_age_s: tokenAgeSeconds(),
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
    return trSafe('errors.fetch.serverUnavailable', NETWORK_FETCH_FALLBACK);
  }
  return fallback;
}
