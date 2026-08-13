/**
 * Transient-failure retry for the expenses fetch.
 *
 * The expenses fetch pulls the whole history in 1000-row pages, so a single
 * dropped request (mobile network hiccup, cold edge, 5xx) used to surface as
 * a red "failed to load" error even though a retry a second later succeeds.
 *
 * This module holds the pure logic:
 *  - `classifyFetchFailure` — network / timeout / http / auth / other
 *  - `runWithTransientRetry` — retries only transient causes with a short
 *    growing backoff, leaving 4xx (and the existing 401/JWT path) untouched.
 *
 * Everything here is dependency-free so it can be unit tested directly.
 */

export type FetchFailureKind = 'network' | 'timeout' | 'http' | 'auth' | 'other';

export interface FetchFailureInfo {
  kind: FetchFailureKind;
  /** HTTP status when the error carries one. */
  status?: number;
  /** Whether a retry has a realistic chance of succeeding. */
  retryable: boolean;
  /** Raw message, for diagnostics only (never shown verbatim to the user). */
  message: string;
}

const readStatus = (error: unknown): number | undefined => {
  const e = error as any;
  const raw = e?.status ?? e?.statusCode ?? e?.originalError?.status;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

const readMessage = (error: unknown): string => {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const e = error as any;
  return String(e?.message ?? e?.error_description ?? e?.error ?? '');
};

/** Classifies a caught fetch error into a cause + retryability. */
export function classifyFetchFailure(error: unknown): FetchFailureInfo {
  const message = readMessage(error);
  const msg = message.toLowerCase();
  const name = String((error as any)?.name ?? '');
  const code = String((error as any)?.code ?? '');
  const status = readStatus(error);

  // Auth keeps its own dedicated path (refreshSession + single retry).
  if (
    status === 401 ||
    /jwt|token.*expir|unauthorized/i.test(message) ||
    code === 'PGRST301'
  ) {
    return { kind: 'auth', status, retryable: false, message };
  }

  if (name === 'AbortError' || msg.includes('aborted') || msg.includes('timeout') || msg.includes('timed out')) {
    return { kind: 'timeout', status, retryable: true, message };
  }

  if (
    msg.includes('failed to fetch') ||
    msg.includes('network request failed') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('connection') ||
    (name === 'TypeError' && msg.includes('fetch'))
  ) {
    return { kind: 'network', status, retryable: true, message };
  }

  if (typeof status === 'number') {
    // 5xx is transient; every other 4xx (401 handled above) is not.
    return { kind: 'http', status, retryable: status >= 500, message };
  }

  return { kind: 'other', status, retryable: false, message };
}

/** Backoff between attempts, in ms — 3 attempts total by default. */
export const RETRY_DELAYS_MS = [1000, 3000];

export interface RetryHooks<T> {
  /** Delays between attempts; length + 1 = max attempts. */
  delays?: number[];
  /** Called before each retry with the classified cause + 1-based attempt just failed. */
  onRetry?: (info: FetchFailureInfo, attempt: number) => void;
  /** Injectable sleep (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
}

export interface RetryOutcome<T> {
  result: T;
  /** Number of attempts made (1 = succeeded first try). */
  attempts: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Runs `fn`, retrying only transient failures with a growing backoff.
 * Non-retryable failures are rethrown immediately, unchanged.
 */
export async function runWithTransientRetry<T>(
  fn: (attempt: number) => Promise<T>,
  hooks: RetryHooks<T> = {},
): Promise<RetryOutcome<T>> {
  const delays = hooks.delays ?? RETRY_DELAYS_MS;
  const sleep = hooks.sleep ?? defaultSleep;
  const maxAttempts = delays.length + 1;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      const result = await fn(attempt);
      return { result, attempts: attempt };
    } catch (error) {
      const info = classifyFetchFailure(error);
      if (!info.retryable || attempt >= maxAttempts) throw error;
      hooks.onRetry?.(info, attempt);
      await sleep(delays[attempt - 1]);
    }
  }
}
