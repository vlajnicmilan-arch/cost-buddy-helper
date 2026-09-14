/**
 * Rok (timeout) za dohvate Početne.
 *
 * Na slaboj vezi (Android koji u pozadini zamrzne mrežu) zahtjev zna visjeti
 * minutama prije nego pukne — u dnevniku je zabilježen dohvat budžeta od
 * ~413 s. Zahtjev koji prekorači rok prekidamo (AbortController) i bacamo
 * grešku tipa "timeout", koju postojeći `runWithTransientRetry` prepoznaje
 * kao prolaznu i tiho ponavlja.
 *
 * Modul je bez ovisnosti (osim DOM API-ja) kako bi bio izravno testabilan.
 */

/** Rok za manje dohvate Početne. */
export const HOME_FETCH_TIMEOUT_MS = 30_000;

/** Rok za cijeli straničeni dohvat transakcija, ne za pojedinu stranicu. */
export const EXPENSES_FETCH_TIMEOUT_MS = 90_000;

export class FetchTimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Pokreće `fn` uz rok. `fn` dobiva `AbortSignal` koji se prekida kad rok
 * istekne — Supabase upiti ga primaju preko `.abortSignal(signal)`. Ako neki
 * poziv signal ne prima, `Promise.race` svejedno završi čekanje.
 */
export function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number = HOME_FETCH_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        controller.abort();
      } catch {
        /* abort je best-effort */
      }
      reject(new FetchTimeoutError(ms));
    }, ms);
  });

  return Promise.race([fn(controller.signal), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/**
 * Rok koji nakon aborta čeka da se podložni zahtjev stvarno zatvori.
 * Koristi se za veliki dohvat transakcija kako novi single-flight zahtjev ne
 * bi krenuo dok API sloj još drži vezu prethodnog zahtjeva.
 *
 * `opts.cancel` omogućuje prijevremeni prekid izvana (npr. token je u međuvremenu
 * osvježen, pa zahtjev sa starim tokenom nema smisla čekati do roka).
 */
export function withTimeoutAndDrain<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  opts: { cancel?: (trigger: (reason: Error) => void) => () => void } = {},
): Promise<T> {
  const controller = new AbortController();
  let failure: Error | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe: (() => void) | null = null;
  const task = fn(controller.signal);

  return new Promise<T>((resolve, reject) => {
    const fail = (reason: Error) => {
      if (failure) return;
      failure = reason;
      try {
        controller.abort();
      } catch {
        /* abort je best-effort */
      }
    };

    timer = setTimeout(() => fail(new FetchTimeoutError(ms)), ms);
    unsubscribe = opts.cancel ? opts.cancel(fail) : null;

    task.then(
      (value) => (failure ? reject(failure) : resolve(value)),
      (error) => reject(failure ?? error),
    );
  }).finally(() => {
    if (timer) clearTimeout(timer);
    if (unsubscribe) unsubscribe();
  });
}

