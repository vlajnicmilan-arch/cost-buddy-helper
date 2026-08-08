/**
 * MAIL UVOZ — brane na prijemu (rate limit po aliasu).
 *
 * Preko granice poruka se i dalje SPREMA SIROVA, ali BEZ posla u redu.
 * Ništa se ne gubi: korisnik u postavkama vidi status `zaustavljena_branom`
 * i ima akciju "Pokreni ručno".
 */

export const MAX_MESSAGES_PER_HOUR = 30;
export const MAX_MESSAGES_PER_DAY = 100;
/** Sirove poruke zaustavljene branom čiste se nakon ovoliko dana. */
export const DAM_RETENTION_DAYS = 7;

export interface RateWindowCounts {
  lastHour: number;
  lastDay: number;
}

export type DamReason = 'brana_sat' | 'brana_dan' | null;

export interface DamVerdict {
  /** Smije li se posao staviti u red. */
  enqueue: boolean;
  reason: DamReason;
}

export function evaluateDam(counts: RateWindowCounts): DamVerdict {
  if (counts.lastHour >= MAX_MESSAGES_PER_HOUR) {
    return { enqueue: false, reason: 'brana_sat' };
  }
  if (counts.lastDay >= MAX_MESSAGES_PER_DAY) {
    return { enqueue: false, reason: 'brana_dan' };
  }
  return { enqueue: true, reason: null };
}
