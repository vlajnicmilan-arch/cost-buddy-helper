/**
 * POVRATAK KOJI NIKAD NE ZAROBLJAVA.
 *
 * Problem: ekran na koji se dođe kroz BRIEF-VRATA (navigacija s `replace`)
 * može biti PRVA stavka povijesti preglednika. Tada `navigate(-1)` nema kamo —
 * korisnik ostaje na ekranu bez izlaza.
 *
 * ODABRANI SIGNAL: `window.history.state.idx` koji održava sam React Router
 * (history v5 `createBrowserHistory` upisuje `{ usr, key, idx }` u state).
 * `idx === 0` znači doslovno „ovo je prva stavka router stacka" — iza nje nema
 * ničega našega. Kao rezervni signal koristimo `location.key === 'default'`,
 * što React Router dodjeljuje isključivo početnoj lokaciji.
 *
 * ZAŠTO NE `window.history.length`: broji i stavke drugih stranica iz iste
 * kartice (prije ulaska u aplikaciju), pa je i kod hladnog pokretanja često > 1
 * — tj. lažno tvrdi da povratak postoji.
 */

export interface BackSignals {
  /** `window.history.state?.idx` ako postoji. */
  historyIdx: number | null;
  /** `useLocation().key`. */
  locationKey: string | null;
}

/** Istina kad unutar aplikacije NEMA stavke na koju bi se `navigate(-1)` vratio. */
export function shouldFallbackToHome({ historyIdx, locationKey }: BackSignals): boolean {
  if (typeof historyIdx === 'number') return historyIdx <= 0;
  return locationKey === 'default';
}

export function readHistoryIdx(): number | null {
  try {
    const state = typeof window === 'undefined' ? null : (window.history.state as unknown);
    if (state && typeof state === 'object' && 'idx' in state) {
      const idx = (state as { idx?: unknown }).idx;
      return typeof idx === 'number' ? idx : null;
    }
  } catch {
    /* fail-open: nepoznato => oslanjamo se na locationKey */
  }
  return null;
}

/** Odredište kad povratka nema. Centar je jedini ekran s donjom navigacijom. */
export const BACK_FALLBACK_PATH = '/app';
