/**
 * DIJELJENI DOSEG NOVČANIKA (mapa novčanik → tvrtka + skupovi pristupa)
 *
 * `useExpenseFetch` se montira u desetak komponenti, a svaka je instanca do
 * sada vodila VLASTITU mapu `custom_payment_sources.id → business_profile_id`.
 * Pravilo „nepoznat novčanik = skriven" (`viewModeScope`) znači da instanca s
 * praznom mapom sakrije sve `custom:` retke — i vlastite. To se dogodilo kad
 * je prozor svježine (`expensesFreshness`) preskočio početni dohvat doseg
 * podataka.
 *
 * Zato mapa živi ovdje: modul-level, dijeljena među svim instancama, sa
 * sinkronim čitanjem pri montiranju (kao `useHiddenPaymentSources`) i
 * trajnom snimkom (`instantCache`) da preživi hladno otvaranje. Mrežni dohvat
 * je samo OSVJEŽAVA — nikad ne ostavlja instancu bez mape.
 */
import { instantCache } from '@/lib/instantCache';

export interface SourceScopeState {
  /** custom_payment_sources.id → business_profile_id (null = osobni). */
  sourceBusinessMap: Map<string, string | null>;
  /** Novčanici kojima korisnik ima pristup (vlastiti + članstva). */
  sharedIds: Set<string>;
  /** Podskup s punim pristupom (vlastiti + role 'full'). */
  fullIds: Set<string>;
  /** Vlastiti income_sources. */
  ownedIncomeIds: Set<string>;
  /** VLASTITI novčanici (user_id = auth.uid()) → business_profile_id. */
  ownSourceMap: Map<string, string | null>;
  /** true = doseg dolazi iz snimke, nije potvrđen mrežom. */
  fromSnapshot: boolean;
}

type Listener = (state: SourceScopeState) => void;

const cacheByUser = new Map<string, SourceScopeState>();
const listeners = new Map<string, Set<Listener>>();

const scopeCacheKey = (userId: string) => `sourceScope:v1:${userId}`;

interface PersistedScope {
  map: [string, string | null][];
  own: [string, string | null][];
}

const emptyState = (): SourceScopeState => ({
  sourceBusinessMap: new Map(),
  sharedIds: new Set(),
  fullIds: new Set(),
  ownedIncomeIds: new Set(),
  ownSourceMap: new Map(),
  fromSnapshot: true,
});

/** Snimka vlastitog dosega iz prethodnog pokretanja. */
const readPersistedScope = (userId: string): SourceScopeState | null => {
  const raw = instantCache.read<PersistedScope>(scopeCacheKey(userId));
  if (!raw || !Array.isArray(raw.map) || raw.map.length === 0) return null;
  const state = emptyState();
  raw.map.forEach(([id, bp]) => state.sourceBusinessMap.set(id, bp ?? null));
  (raw.own || []).forEach(([id, bp]) => state.ownSourceMap.set(id, bp ?? null));
  return state;
};

const persistScope = (userId: string, state: SourceScopeState): void => {
  instantCache.write<PersistedScope>(scopeCacheKey(userId), {
    map: [...state.sourceBusinessMap.entries()],
    own: [...state.ownSourceMap.entries()],
  });
};

const storages = (): Storage[] => {
  const out: Storage[] = [];
  try { if (typeof sessionStorage !== 'undefined') out.push(sessionStorage); } catch { /* noop */ }
  try { if (typeof localStorage !== 'undefined') out.push(localStorage); } catch { /* noop */ }
  return out;
};

interface CachedSourceRow {
  id?: string;
  user_id?: string;
  business_profile_id?: string | null;
}

/**
 * Rezerva: lokalna snimka popisa novčanika koju piše `useCustomPaymentSources`
 * (`cache:paymentSources:v1:<userId>:...`). Dovoljna je da se VLASTITI
 * novčanici prepoznaju i prije prvog mrežnog odgovora.
 */
export const seedFromPaymentSourcesCache = (userId: string): SourceScopeState | null => {
  const prefix = `cache:paymentSources:v1:${userId}:`;
  const state = emptyState();
  let found = false;
  storages().forEach((storage) => {
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        const raw = storage.getItem(key);
        if (!raw) continue;
        const rows = JSON.parse(raw) as CachedSourceRow[];
        if (!Array.isArray(rows)) continue;
        rows.forEach((row) => {
          if (!row?.id) return;
          const bp = row.business_profile_id ?? null;
          state.sourceBusinessMap.set(row.id, bp);
          if (row.user_id === userId) state.ownSourceMap.set(row.id, bp);
          found = true;
        });
      }
    } catch { /* snimka je best-effort */ }
  });
  return found ? state : null;
};

/**
 * Doseg za tog korisnika — sinkrono, bez mreže.
 * Redoslijed: dijeljeni cache → trajna snimka dosega → snimka novčanika.
 */
export const readSourceScope = (userId: string | null | undefined): SourceScopeState => {
  if (!userId) return emptyState();
  const cached = cacheByUser.get(userId);
  if (cached) return cached;

  const persisted = readPersistedScope(userId);
  if (persisted) {
    cacheByUser.set(userId, persisted);
    return persisted;
  }

  const seeded = seedFromPaymentSourcesCache(userId);
  if (seeded) {
    cacheByUser.set(userId, seeded);
    return seeded;
  }

  return emptyState();
};

/** Zapisuje potvrđeni (mrežni) doseg i obavještava sve montirane instance. */
export const writeSourceScope = (
  userId: string,
  next: Omit<SourceScopeState, 'fromSnapshot'>,
): SourceScopeState => {
  const state: SourceScopeState = { ...next, fromSnapshot: false };
  cacheByUser.set(userId, state);
  persistScope(userId, state);
  listeners.get(userId)?.forEach((l) => l(state));
  return state;
};

export const subscribeSourceScope = (userId: string, listener: Listener): (() => void) => {
  const set = listeners.get(userId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(userId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(userId);
  };
};

export const __resetSourceScopeCacheForTests = (): void => {
  cacheByUser.clear();
  listeners.clear();
};
