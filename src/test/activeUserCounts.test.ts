import { describe, it, expect } from 'vitest';
import { countDistinctActiveUsers, computeActiveUserCounts } from '@/lib/activeUserCounts';
import hr from '@/i18n/locales/hr.json';
import en from '@/i18n/locales/en.json';
import de from '@/i18n/locales/de.json';

const NOW = Date.parse('2026-08-27T19:40:00.000Z');
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();

describe('activeUserCounts', () => {
  it('counts each user once regardless of login count', () => {
    const rows = [
      { user_id: 'a', logged_in_at: ago(1) },
      { user_id: 'a', logged_in_at: ago(2) },
      { user_id: 'a', logged_in_at: ago(3) },
      { user_id: 'b', logged_in_at: ago(5) },
    ];
    expect(computeActiveUserCounts(rows, NOW)).toEqual({ active24h: 2, active7d: 2 });
  });

  it('does not count a user without any login in the window', () => {
    const rows = [
      { user_id: 'a', logged_in_at: ago(1) },
      { user_id: 'old', logged_in_at: ago(24 * 30) },
    ];
    const counts = computeActiveUserCounts(rows, NOW);
    expect(counts.active24h).toBe(1);
    expect(counts.active7d).toBe(1);
  });

  it('separates the 24h and 7d windows', () => {
    const rows = [
      { user_id: 'a', logged_in_at: ago(2) },
      { user_id: 'b', logged_in_at: ago(50) },
      { user_id: 'c', logged_in_at: ago(24 * 6) },
    ];
    expect(computeActiveUserCounts(rows, NOW)).toEqual({ active24h: 1, active7d: 3 });
  });

  it('ignores rows without user_id or with unparsable timestamps', () => {
    const rows = [
      { user_id: null, logged_in_at: ago(1) },
      { user_id: 'x', logged_in_at: 'not-a-date' },
    ];
    expect(countDistinctActiveUsers(rows, ago(24))).toBe(0);
  });

  it('returns zero on empty input', () => {
    expect(computeActiveUserCounts([], NOW)).toEqual({ active24h: 0, active7d: 0 });
  });
});

describe('day7 label honesty', () => {
  const labels = {
    hr: (hr as any).admin.funnel.day7,
    en: (en as any).admin.funnel.day7,
    de: (de as any).admin.funnel.day7,
  };

  it('has the honest label in hr/en/de', () => {
    expect(labels.hr).toBe('Vratio se 7. dana');
    expect(labels.en).toBe('Returned on day 7');
    expect(labels.de).toBe('Am 7. Tag zurückgekehrt');
  });

  it('never uses the old misleading label', () => {
    for (const v of Object.values(labels)) {
      expect(v).not.toBe('Aktivni 7. dan');
    }
    for (const cat of [hr, en, de]) {
      expect(JSON.stringify(cat)).not.toContain('Aktivni 7. dan');
    }
  });

  it('ships the explainer in all three languages', () => {
    for (const cat of [hr, en, de]) {
      expect((cat as any).admin.funnel.day7Explainer.length).toBeGreaterThan(40);
    }
  });
});
