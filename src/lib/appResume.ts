/**
 * App resume — svježina podataka na povratku u fokus.
 *
 * Treća karika trilogije: kod se osvježava kroz `bundleFreshness`, kartice
 * umiru serverski kroz trigger, a PODACI se bude s korisnikom ovdje.
 *
 * Ovaj modul NE dira `bundleFreshness` ponašanje — dijeli isti okidač
 * (`visibilitychange` → visible) i dodaje `online` (povratak mreže).
 *
 * Pravila:
 *  - tiho: pozadinski refetch, bez spinnera i bez poruka o grešci,
 *  - debounce: povratak u fokus ne smije okinuti lavinu upita,
 *  - fail-safe: neuspjeh (offline/timeout) = ništa se ne događa, pokušava se
 *    ponovno na sljedeći fokus/online.
 */

/** Minimalni razmak između dva pozadinska osvježenja istog potrošača. */
export const APP_RESUME_MIN_INTERVAL_MS = 20_000;

export type AppResumeReason = 'focus' | 'online';

export interface ResumeDecisionInput {
  /** Vrijeme zadnjeg uspješno pokrenutog osvježenja (0 = nikad). */
  lastRunAt: number;
  now: number;
  minIntervalMs?: number;
  /** Osvježenje je već u tijeku — drugi poziv se preskače. */
  inFlight?: boolean;
  enabled?: boolean;
}

/**
 * Čista odluka: smije li se pozadinsko osvježenje pokrenuti.
 * Isti prag vrijedi za `focus` i `online` — svaki potrošač ima vlastiti brojač.
 */
export const shouldResume = ({
  lastRunAt,
  now,
  minIntervalMs = APP_RESUME_MIN_INTERVAL_MS,
  inFlight = false,
  enabled = true,
}: ResumeDecisionInput): boolean => {
  if (!enabled) return false;
  if (inFlight) return false;
  if (lastRunAt > 0 && now - lastRunAt < minIntervalMs) return false;
  return true;
};

/** Kanal je živ samo u stanju `joined`; sve ostalo traži ponovnu pretplatu. */
export type RealtimeChannelState =
  | 'joined'
  | 'joining'
  | 'closed'
  | 'errored'
  | 'leaving'
  | string
  | undefined
  | null;

export const needsResubscribe = (state: RealtimeChannelState): boolean => {
  if (!state) return true;
  return state !== 'joined' && state !== 'joining';
};
