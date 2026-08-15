import { describe, it, expect } from 'vitest';
import { buildBriefMessages, continuityFromSnapshot, deriveCategoryState } from '@/lib/brief/engine';
import type { BriefContinuity, BriefSnapshot } from '@/lib/brief/types';

const filter = (path: string) => ({ path });
/** Dokazive destinacije po kategoriji (vidi src/lib/brief/destinations.ts). */
const pendingFilter = { path: '/dokumenti', tab: 'pending' };
/** Mail postaje dokaziv tek kad ekran obradenih dokumenata postoji. */
const processedFilter = { path: '/dokumenti', tab: 'processed' };

const snap = (parts: Partial<BriefSnapshot['categories']>): BriefSnapshot => ({
  enabled: true,
  categories: parts as BriefSnapshot['categories'],
});

describe('brief motor — prioritet', () => {
  it('sve tri kategorije => redoslijed neizvjesnost > dospijece > mail', () => {
    const s = snap({
      due: { count: 2, watermark: '2026-08-15T08:00:00Z', filter: filter('/home') },
      mail: { count: 1, watermark: '2026-08-15T08:00:00Z', filter: processedFilter },
      uncertainty: { count: 3, watermark: '2026-08-15T08:00:00Z', filter: pendingFilter },
    });
    const msgs = buildBriefMessages({ snapshot: s, continuity: {} });
    expect(msgs.map((m) => m.category)).toEqual(['uncertainty', 'due', 'mail']);
  });

  it('najvise tri poruke', () => {
    const s = snap({
      uncertainty: { count: 1, watermark: null, filter: pendingFilter },
      due: { count: 1, watermark: null, filter: filter('/home') },
      mail: { count: 1, watermark: null, filter: processedFilter },
    });
    expect(buildBriefMessages({ snapshot: s, continuity: {} }).length).toBeLessThanOrEqual(3);
  });
});

describe('brief motor — tisina i MIRNO', () => {
  it('sve prazno i nista prije => MIRNO (prvi put)', () => {
    const s = snap({ uncertainty: { count: 0, watermark: null, filter: pendingFilter } });
    const msgs = buildBriefMessages({ snapshot: s, continuity: {} });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].category).toBe('calm');
    expect(msgs[0].textKey).toBe('briefGate.calm.firstToday');
  });

  it('MIRNO je fallback — nikad uz drugu poruku', () => {
    const s = snap({ uncertainty: { count: 1, watermark: null, filter: pendingFilter } });
    const msgs = buildBriefMessages({ snapshot: s, continuity: {} });
    expect(msgs.some((m) => m.category === 'calm')).toBe(false);
  });

  it('nema snimke => MIRNO, nikad izmisljena kategorija', () => {
    const msgs = buildBriefMessages({ snapshot: null, continuity: {} });
    expect(msgs.map((m) => m.category)).toEqual(['calm']);
  });
});

describe('brief motor — stanja cinjenice', () => {
  const prev = { count: 3, watermark: '2026-08-14T10:00:00Z', shownAt: '2026-08-14T10:00:00Z' };

  it('NEW kad nema zapisa', () => {
    expect(deriveCategoryState(undefined, { count: 1, watermark: null, filter: null })).toBe('new');
  });

  it('watermark ima prednost: isti broj, noviji watermark => NEW', () => {
    expect(
      deriveCategoryState(prev, { count: 3, watermark: '2026-08-15T09:00:00Z', filter: null }),
    ).toBe('new');
  });

  it('manji broj, stari watermark => REMINDER', () => {
    expect(deriveCategoryState(prev, { count: 1, watermark: prev.watermark, filter: null })).toBe('reminder');
  });

  it('isti broj i isti watermark => UNCHANGED', () => {
    expect(deriveCategoryState(prev, { count: 3, watermark: prev.watermark, filter: null })).toBe('unchanged');
  });

  it('nula => RESOLVED, i prikazuje se samo ako je prije nesto stajalo', () => {
    const continuity: BriefContinuity = { uncertainty: prev };
    const s = snap({ uncertainty: { count: 0, watermark: prev.watermark, filter: pendingFilter } });
    const msgs = buildBriefMessages({ snapshot: s, continuity });
    expect(msgs[0].textKey).toBe('briefGate.uncertainty.resolved');

    const fresh = buildBriefMessages({ snapshot: s, continuity: {} });
    expect(fresh[0].category).toBe('calm');
  });
});

describe('brief motor — dokaziva destinacija', () => {
  it('bez filtera nema poruke', () => {
    const s = snap({ uncertainty: { count: 5, watermark: null, filter: null } });
    expect(buildBriefMessages({ snapshot: s, continuity: {} })[0].category).toBe('calm');
  });
});

describe('brief motor — mail', () => {
  it('mail se javlja samo kao novost', () => {
    const continuity: BriefContinuity = {
      mail: { count: 2, watermark: '2026-08-15T08:00:00Z', shownAt: '2026-08-15T08:00:00Z' },
    };
    const s = snap({ mail: { count: 2, watermark: '2026-08-15T08:00:00Z', filter: processedFilter } });
    expect(buildBriefMessages({ snapshot: s, continuity })[0].category).toBe('calm');
  });
});

describe('brief motor — kontinuitet', () => {
  it('zapis nastaje iz snimke', () => {
    const now = new Date('2026-08-15T12:00:00Z');
    const s = snap({ due: { count: 2, watermark: '2026-08-15T08:00:00Z', filter: filter('/home') } });
    expect(continuityFromSnapshot(s, now).due).toEqual({
      count: 2,
      watermark: '2026-08-15T08:00:00Z',
      shownAt: now.toISOString(),
    });
  });

  it('djelomicna snimka: kategorija koja nedostaje se tiho izostavlja', () => {
    const s = snap({ due: { count: 1, watermark: null, filter: filter('/home') } });
    const msgs = buildBriefMessages({ snapshot: s, continuity: {} });
    expect(msgs.map((m) => m.category)).toEqual(['due']);
  });
});
