/**
 * Chunk-load error recovery
 *
 * Vite serves lazy-loaded routes as hashed chunks (e.g. Auth-AbC123.js).
 * When a deploy ships, old hashes disappear. Browsers/PWAs that cached an
 * older index.html will try to fetch a chunk URL that 404s, throwing:
 *
 *   TypeError: Failed to fetch dynamically imported module: .../Auth.tsx
 *   TypeError: error loading dynamically imported module
 *   SyntaxError: Importing a module script failed
 *   ChunkLoadError: Loading chunk N failed
 *
 * These are NOT app bugs — they're stale-cache artifacts. The fix is a
 * single hard reload to fetch the fresh index.html with current chunk URLs.
 *
 * To prevent reload loops (e.g. server actually down), we use a
 * sessionStorage guard: only auto-reload once per 30s window.
 */

const RELOAD_GUARD_KEY = 'vmb-chunk-reload-at';
const RELOAD_GUARD_MS = 30_000;

const PATTERNS: string[] = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'ChunkLoadError',
  'Loading chunk',
  'Loading CSS chunk',
];

export const isChunkLoadError = (err: unknown): boolean => {
  if (!err) return false;
  const anyErr = err as { name?: string; message?: string };
  if (anyErr?.name === 'ChunkLoadError') return true;
  const msg =
    (typeof anyErr?.message === 'string' && anyErr.message) ||
    (typeof err === 'string' ? err : '') ||
    '';
  if (!msg) return false;
  return PATTERNS.some((p) => msg.includes(p));
};

/**
 * If `err` is a stale-chunk error and we haven't recently auto-reloaded,
 * trigger a hard reload and return true. Caller should bail out of any
 * further handling (logging, Sentry, crash UI) when true is returned.
 */
export const tryRecoverFromChunkError = (err: unknown): boolean => {
  if (!isChunkLoadError(err)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? '0');
    const now = Date.now();
    if (last && now - last < RELOAD_GUARD_MS) {
      // Already tried recently — let the normal error path take over.
      return false;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
  } catch {
    /* sessionStorage unavailable — still attempt reload once */
  }
  try {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  } catch {
    /* ignore */
  }
  return true;
};
