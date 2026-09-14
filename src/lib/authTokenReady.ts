/**
 * Spremnost tokena prijave.
 *
 * Na hladnom otvaranju kartice postoji SPREMLJENA sesija, ali njezin
 * `access_token` može biti istekao. Dok ga Supabase klijent osvježava, dohvati
 * Početne vise do roka (30 s), pale žutu traku i tek drugi pokušaj prođe u
 * sekundi. Zato `authReady` čeka valjan token, a ovaj modul drži trenutke:
 *
 *  - `markTokenRefreshed()` — token je upravo osvježen,
 *  - `markTokenReady()`     — prijava je gotova i token je valjan.
 *
 * Dohvat koji je krenuo PRIJE tog trenutka smije se ponoviti odmah (bez
 * čekanja razmaka) i ne pali traku "veza je slaba" — nije mrežni problem.
 *
 * Modul je bez ovisnosti kako bi bio izravno testabilan.
 */

/** Token se smatra valjanim samo ako mu ostaje više od ove rezerve. */
export const TOKEN_MIN_REMAINING_SEC = 60;

/** `expires_at` je u sekundama (Supabase sesija). */
export function isTokenValid(
  expiresAtSec?: number | null,
  nowMs: number = Date.now(),
  minRemainingSec: number = TOKEN_MIN_REMAINING_SEC,
): boolean {
  if (typeof expiresAtSec !== 'number' || !Number.isFinite(expiresAtSec)) return false;
  return expiresAtSec * 1000 - nowMs > minRemainingSec * 1000;
}

let lastTokenRefreshAt: number | null = null;
let tokenReadyAt: number | null = null;
const refreshListeners = new Set<() => void>();

export function markTokenRefreshed(at: number = Date.now()): void {
  lastTokenRefreshAt = at;
  refreshListeners.forEach((l) => {
    try {
      l();
    } catch {
      /* best-effort */
    }
  });
}

export function markTokenReady(at: number = Date.now()): void {
  if (tokenReadyAt === null) tokenReadyAt = at;
}

export function getTokenReadyAt(): number | null {
  return tokenReadyAt;
}

export function getLastTokenRefreshAt(): number | null {
  return lastTokenRefreshAt;
}

/** Pretplata na osvježenje tokena; vraća funkciju za odjavu. */
export function subscribeTokenRefresh(listener: () => void): () => void {
  refreshListeners.add(listener);
  return () => {
    refreshListeners.delete(listener);
  };
}

/**
 * Je li dohvat krenuo prije nego je token bio spreman? Takav pad nije mrežni
 * problem: ponavlja se odmah i bez žute trake.
 */
export function startedBeforeTokenReady(startedAt: number): boolean {
  return tokenReadyAt !== null && startedAt < tokenReadyAt;
}

/** Koliko je dohvat čekao da token postane valjan (0 kad nije čekao). */
export function waitedForAuthMs(startedAt: number): number {
  if (tokenReadyAt === null || tokenReadyAt <= startedAt) return 0;
  return tokenReadyAt - startedAt;
}

/** Starost tokena u sekundama (od zadnjeg osvježenja, inače od spremnosti). */
export function tokenAgeSeconds(now: number = Date.now()): number | null {
  const base = lastTokenRefreshAt ?? tokenReadyAt;
  if (base === null) return null;
  return Math.max(0, Math.round((now - base) / 1000));
}

/** Greška kojom prekidamo zahtjev poslan sa starim tokenom. */
export class StaleTokenError extends Error {
  constructor() {
    super('Aborted: auth token refreshed');
    this.name = 'AbortError';
  }
}

export function __resetAuthTokenReadyForTests(): void {
  lastTokenRefreshAt = null;
  tokenReadyAt = null;
  refreshListeners.clear();
}
