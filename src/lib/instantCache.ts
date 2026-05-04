/**
 * Instant cache helper — stale-while-revalidate pattern.
 *
 * Reads/writes JSON snapshots to sessionStorage (with localStorage fallback
 * for survival across tab close / Capacitor restart). Used by data hooks to
 * paint last-known state instantly on mount, then silently revalidate.
 *
 * Notes:
 * - Custom replacer/reviver handles Date objects (expenses[].date).
 * - All errors are swallowed (cache is best-effort, never blocks app).
 * - Keys are versioned (vN) so shape changes invalidate cleanly.
 */

const CACHE_PREFIX = 'cache:';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

const replacer = (_key: string, value: unknown): unknown => {
  if (value instanceof Date) {
    return { __t: 'Date', v: value.toISOString() };
  }
  return value;
};

const reviver = (_key: string, value: unknown): unknown => {
  if (value && typeof value === 'object') {
    const v = value as { __t?: string; v?: string };
    if (v.__t === 'Date' && typeof v.v === 'string') {
      return new Date(v.v);
    }
  }
  // Bare ISO date strings → Date (for legacy/raw payloads)
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return value;
};

const safeSession = (): Storage | null => {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
};

const safeLocal = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export const instantCache = {
  read<T>(key: string): T | null {
    const fullKey = CACHE_PREFIX + key;
    const ss = safeSession();
    const ls = safeLocal();
    let raw: string | null = null;
    try {
      raw = ss?.getItem(fullKey) ?? null;
    } catch { /* noop */ }
    if (!raw) {
      try {
        raw = ls?.getItem(fullKey) ?? null;
      } catch { /* noop */ }
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw, reviver) as T;
    } catch (err) {
      console.warn('[instantCache] parse failed for', key, err);
      return null;
    }
  },

  write<T>(key: string, data: T): void {
    const fullKey = CACHE_PREFIX + key;
    let serialized: string;
    try {
      serialized = JSON.stringify(data, replacer);
    } catch (err) {
      console.warn('[instantCache] stringify failed for', key, err);
      return;
    }
    const ss = safeSession();
    const ls = safeLocal();
    try { ss?.setItem(fullKey, serialized); } catch { /* quota */ }
    try { ls?.setItem(fullKey, serialized); } catch { /* quota */ }
  },

  remove(key: string): void {
    const fullKey = CACHE_PREFIX + key;
    try { safeSession()?.removeItem(fullKey); } catch { /* noop */ }
    try { safeLocal()?.removeItem(fullKey); } catch { /* noop */ }
  },

  clearAll(): void {
    const purge = (storage: Storage | null) => {
      if (!storage) return;
      try {
        const keys: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
        }
        keys.forEach(k => {
          try { storage.removeItem(k); } catch { /* noop */ }
        });
      } catch { /* noop */ }
    };
    purge(safeSession());
    purge(safeLocal());
  },
};
