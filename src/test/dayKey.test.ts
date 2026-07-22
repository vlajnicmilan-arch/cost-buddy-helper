import { describe, it, expect } from 'vitest';
import { toDayKey, isOnOrBeforeDay } from '@/lib/dayKey';

describe('dayKey', () => {
  it('toDayKey normalizira Date', () => {
    expect(toDayKey(new Date(2026, 6, 22, 15, 0))).toBe('2026-07-22');
  });
  it('toDayKey uzima prvih 10 iz ISO stringa', () => {
    expect(toDayKey('2026-07-22')).toBe('2026-07-22');
    expect(toDayKey('2026-07-22T18:00:00Z')).toBe('2026-07-22');
  });
  it('toDayKey handla number (epoch ms)', () => {
    const key = toDayKey(new Date(2026, 0, 1, 12).getTime());
    expect(key).toBe('2026-01-01');
  });
  it('toDayKey vraća null za null/undefined/invalid', () => {
    expect(toDayKey(null)).toBeNull();
    expect(toDayKey(undefined)).toBeNull();
    expect(toDayKey('not-a-date')).toBeNull();
  });

  it('isOnOrBeforeDay — Date vs string anchor', () => {
    expect(isOnOrBeforeDay(new Date(2026, 6, 10), '2026-07-22')).toBe(true);
    expect(isOnOrBeforeDay(new Date(2026, 6, 22), '2026-07-22')).toBe(true);
    expect(isOnOrBeforeDay(new Date(2026, 6, 23), '2026-07-22')).toBe(false);
  });
  it('isOnOrBeforeDay — string value, Date anchor', () => {
    expect(isOnOrBeforeDay('2026-07-01', new Date(2026, 6, 22))).toBe(true);
    expect(isOnOrBeforeDay('2026-08-01', new Date(2026, 6, 22))).toBe(false);
  });
  it('isOnOrBeforeDay — null anchor NE baca i vraća false', () => {
    expect(() => isOnOrBeforeDay(new Date(), null)).not.toThrow();
    expect(isOnOrBeforeDay(new Date(), null)).toBe(false);
    expect(isOnOrBeforeDay(new Date(), undefined)).toBe(false);
  });
  it('isOnOrBeforeDay — nikakav .slice na Date (regression: z.slice is not a function)', () => {
    // Prije: `String(dateObj).slice(0,10) <= anchor.slice(0,10)` — ako anchor bio Date, crash.
    const anchorAsDate = new Date(2026, 6, 22);
    expect(() => isOnOrBeforeDay(new Date(2026, 6, 1), anchorAsDate as any)).not.toThrow();
    expect(isOnOrBeforeDay(new Date(2026, 6, 1), anchorAsDate as any)).toBe(true);
  });
});
