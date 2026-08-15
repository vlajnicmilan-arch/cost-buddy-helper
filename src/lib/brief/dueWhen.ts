/**
 * BRIEF-VRATA — deterministicki izraz roka.
 *
 * Pravilo (bez iznimaka, bez AI):
 *  - isti lokalni dan            => 'today'
 *  - sutra                       => 'tomorrow'
 *  - 2..6 dana unaprijed         => 'weekday' (relativan izraz je jos koristan)
 *  - sve ostalo (>=7 dana, proslost) => 'date'
 */
import { localDayKey } from '@/lib/briefGate';

export type DueWhenKind = 'today' | 'tomorrow' | 'weekday' | 'date';

export interface DueWhen {
  kind: DueWhenKind;
  /** 0 = nedjelja ... 6 = subota. Postoji samo za 'weekday'. */
  weekday?: number;
  /** ISO datum (YYYY-MM-DD). Postoji uvijek. */
  day: string;
}

const MS_DAY = 24 * 60 * 60 * 1000;

/** Broj kalendarskih dana izmedu dva lokalna dana (b - a). */
function dayDelta(a: Date, b: Date): number {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((end - start) / MS_DAY);
}

export function describeDueWhen(dueDate: string | null | undefined, now: Date): DueWhen | null {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return null;
  const day = localDayKey(d);
  const delta = dayDelta(now, d);
  if (delta === 0) return { kind: 'today', day };
  if (delta === 1) return { kind: 'tomorrow', day };
  if (delta >= 2 && delta <= 6) return { kind: 'weekday', weekday: d.getDay(), day };
  return { kind: 'date', day };
}
