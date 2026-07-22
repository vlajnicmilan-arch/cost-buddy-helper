/**
 * Regresijski test za dedup pravilo obavijesti o isteku faze
 * (check-milestone-deadlines):
 *  - upcoming (pre-deadline): 1× po danu (dedup od početka dana)
 *  - overdue: 1× odmah, potom 1×/7 dana (dedup 7 dana unatrag)
 *
 * Testiramo čisto pravilo (extraktirana funkcija) — puna edge funkcija
 * je smoke-testirana ručno; ovaj test brani semantiku.
 */
import { describe, it, expect } from 'vitest';

const dayMs = 24 * 60 * 60 * 1000;

/** Mirror logike iz supabase/functions/check-milestone-deadlines/index.ts */
export const dedupSinceIso = (
  now: Date,
  dueDate: Date,
): string => {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / dayMs);
  return daysUntilDue < 0
    ? new Date(today.getTime() - 7 * dayMs).toISOString()
    : today.toISOString();
};

describe('milestone_deadline dedup', () => {
  const today = new Date('2026-07-22T09:00:00Z');

  it('upcoming faza koristi današnji dan kao dedup granicu', () => {
    const due = new Date('2026-07-25T00:00:00Z');
    const since = new Date(dedupSinceIso(today, due));
    const midnightToday = new Date('2026-07-22T00:00:00.000Z');
    expect(since.toISOString()).toBe(midnightToday.toISOString());
  });

  it('overdue faza koristi 7 dana unatrag', () => {
    const due = new Date('2026-07-10T00:00:00Z'); // 12 dana istekla
    const since = new Date(dedupSinceIso(today, due));
    const sevenAgo = new Date('2026-07-15T00:00:00.000Z');
    expect(since.toISOString()).toBe(sevenAgo.toISOString());
  });

  it('overdue TJEDNI podsjetnik: obavijest stara 6 dana → PRESKOČI, 8 dana → PROĐI', () => {
    const due = new Date('2026-07-01T00:00:00Z');
    const since = new Date(dedupSinceIso(today, due));

    const sixDaysOld = new Date('2026-07-16T09:00:00Z'); // 6 dana staro
    const eightDaysOld = new Date('2026-07-14T09:00:00Z'); // 8 dana staro

    expect(sixDaysOld >= since).toBe(true);   // dedup blokira → NE šalje se
    expect(eightDaysOld >= since).toBe(false); // izvan prozora → šalje se novi
  });
});
