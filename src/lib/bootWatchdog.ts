/**
 * Boot watchdog — pure, testable logic behind `previous_boot_crashed`.
 *
 * The watchdog answers one question: did the previous page load die before
 * React committed its first render? Historically it answered "yes" for every
 * intentional reload, every backgrounded tab and every closed tab, and it did
 * so with `critical` severity — which trained us to ignore the signal.
 *
 * Rules now:
 *  - the flag lives in `sessionStorage` (per tab, no cross-tab collisions),
 *  - an orderly exit (pagehide / tab hidden) clears the flag,
 *  - a reload we triggered ourselves is stamped before it happens and is
 *    consumed on the next boot (informational only, never a crash),
 *  - `critical` requires an actual error signal near the stuck flag; without
 *    one the reason is unknown and the severity is `warning`.
 */

export const BOOT_FLAG = 'vmb-boot-in-progress';
export const BOOT_TS_FLAG = 'vmb-boot-in-progress-started-at';
/** Stamped right before an intentional reload (bundle freshness). */
export const INTENTIONAL_RELOAD_FLAG = 'vmb-intentional-reload';
/** Timestamp of the last real error signal seen in this tab. */
export const LAST_ERROR_FLAG = 'vmb-last-error-at';

/** How close an error must be to a stuck flag to call the boot a real crash. */
export const ERROR_PROXIMITY_MS = 60_000;
/** An intentional-reload stamp older than this is stale and ignored. */
export const INTENTIONAL_RELOAD_TTL_MS = 60_000;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const safeSession = (): StorageLike | null => {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

const safeLocal = (): StorageLike | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

const read = (s: StorageLike | null, key: string): string | null => {
  if (!s) return null;
  try {
    return s.getItem(key);
  } catch {
    return null;
  }
};

const write = (s: StorageLike | null, key: string, value: string): void => {
  if (!s) return;
  try {
    s.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
};

const drop = (s: StorageLike | null, key: string): void => {
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    /* storage unavailable */
  }
};

export interface IntentionalReload {
  at: number;
  reason: string;
  from?: string | null;
  to?: string | null;
}

/** Stamp "the reload that is about to happen is ours". */
export const markIntentionalReload = (
  info: { reason: string; from?: string | null; to?: string | null; now?: number },
  storage?: StorageLike | null,
): void => {
  const s = storage ?? safeSession();
  write(
    s,
    INTENTIONAL_RELOAD_FLAG,
    JSON.stringify({
      at: info.now ?? Date.now(),
      reason: info.reason,
      from: info.from ?? null,
      to: info.to ?? null,
    }),
  );
};

/**
 * Reads and immediately removes the intentional-reload stamp, so it can never
 * mask a real crash that happens later in the same tab.
 */
export const consumeIntentionalReload = (
  storage?: StorageLike | null,
  now: number = Date.now(),
): IntentionalReload | null => {
  const s = storage ?? safeSession();
  const raw = read(s, INTENTIONAL_RELOAD_FLAG);
  drop(s, INTENTIONAL_RELOAD_FLAG);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as IntentionalReload;
    if (!parsed || typeof parsed.at !== 'number') return null;
    if (now - parsed.at > INTENTIONAL_RELOAD_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
};

/** Records that a genuine error signal was observed in this tab. */
export const markErrorSignal = (now: number = Date.now(), storage?: StorageLike | null): void => {
  const value = String(now);
  write(storage ?? safeSession(), LAST_ERROR_FLAG, value);
  // Fallback for contexts where sessionStorage does not survive (WebView kill).
  if (!storage) write(safeLocal(), LAST_ERROR_FLAG, value);
};

export const readLastErrorAt = (storage?: StorageLike | null): number | null => {
  const candidates = storage
    ? [read(storage, LAST_ERROR_FLAG)]
    : [read(safeSession(), LAST_ERROR_FLAG), read(safeLocal(), LAST_ERROR_FLAG)];
  const values = candidates
    .map((v) => (v ? Number(v) : NaN))
    .filter((n) => Number.isFinite(n)) as number[];
  if (values.length === 0) return null;
  return Math.max(...values);
};

export type BootVerdictKind = 'none' | 'intentional_reload' | 'unknown' | 'crash';

export interface BootVerdict {
  kind: BootVerdictKind;
  event?: 'previous_boot_crashed' | 'bundle_refresh_boot';
  severity?: 'critical' | 'error' | 'warning' | 'info';
  details?: Record<string, unknown>;
}

export interface BootVerdictInput {
  /** Value of the boot flag left behind by the previous load. */
  flag: string | null;
  startedAt: string | null;
  intentionalReload: IntentionalReload | null;
  lastErrorAt: number | null;
  now?: number;
  isPreviewEnv?: boolean;
  errorProximityMs?: number;
}

/**
 * Pure verdict on the previous boot.
 *  - no stuck flag                  → nothing happened
 *  - our own reload                 → informational only
 *  - stuck flag, no error nearby    → `warning`, reason unknown
 *  - stuck flag with an error       → `critical` (the real signal)
 */
export const evaluatePreviousBoot = ({
  flag,
  startedAt,
  intentionalReload,
  lastErrorAt,
  now = Date.now(),
  isPreviewEnv = false,
  errorProximityMs = ERROR_PROXIMITY_MS,
}: BootVerdictInput): BootVerdict => {
  if (flag !== '1') return { kind: 'none' };

  if (intentionalReload) {
    return {
      kind: 'intentional_reload',
      event: 'bundle_refresh_boot',
      severity: 'info',
      details: {
        previous_started_at: startedAt,
        reason: intentionalReload.reason,
        from: intentionalReload.from,
        to: intentionalReload.to,
      },
    };
  }

  const hasNearbyError =
    typeof lastErrorAt === 'number' && now - lastErrorAt >= 0 && now - lastErrorAt <= errorProximityMs;

  if (!hasNearbyError) {
    return {
      kind: 'unknown',
      event: 'previous_boot_crashed',
      severity: isPreviewEnv ? 'info' : 'warning',
      details: {
        previous_started_at: startedAt,
        reason: 'unknown_no_error_signal',
        last_error_at: lastErrorAt ? new Date(lastErrorAt).toISOString() : null,
      },
    };
  }

  return {
    kind: 'crash',
    event: 'previous_boot_crashed',
    severity: isPreviewEnv ? 'info' : 'critical',
    details: {
      previous_started_at: startedAt,
      reason: 'error_before_mount',
      last_error_at: new Date(lastErrorAt as number).toISOString(),
    },
  };
};

/** Clears the boot flag — used by orderly exits and by a completed mount. */
export const clearBootFlag = (storage?: StorageLike | null): void => {
  const s = storage ?? safeSession();
  drop(s, BOOT_FLAG);
  drop(s, BOOT_TS_FLAG);
  // Legacy keys from the localStorage era — clean them up once, so an old
  // stuck value can never resurrect the false positive.
  if (!storage) {
    drop(safeLocal(), BOOT_FLAG);
    drop(safeLocal(), BOOT_TS_FLAG);
  }
};

export const setBootFlag = (now: Date = new Date(), storage?: StorageLike | null): void => {
  const s = storage ?? safeSession();
  write(s, BOOT_FLAG, '1');
  write(s, BOOT_TS_FLAG, now.toISOString());
};

export const readBootFlag = (storage?: StorageLike | null) => {
  const s = storage ?? safeSession();
  return { flag: read(s, BOOT_FLAG), startedAt: read(s, BOOT_TS_FLAG) };
};
