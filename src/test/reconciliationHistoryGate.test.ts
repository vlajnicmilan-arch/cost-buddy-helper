/**
 * History gate — regresija za slučaj "Biznis Akrobat":
 * sidro na današnji dan, transakcije iz siječnja/veljače, uvoz povijesti.
 * Prije popravka je svaki povijesni izvod tražio odluku o saldu.
 */
import { describe, it, expect } from 'vitest';
import {
  isHistoricalBatch,
  shouldReconcile,
  isHistoricalWithGap,
  resolveAsOfIso,
} from '@/lib/reconciliation/historyGate';

const base = {
  hasBankRow: true,
  delta: 249.82,
  anchorDate: '2026-08-02T22:45:01.889Z',
};

describe('isHistoricalBatch', () => {
  it('izvod koji završava prije sidra je povijesni', () => {
    expect(isHistoricalBatch({ ...base, batchLastAt: '2026-02-26T11:00:00Z' })).toBe(true);
  });

  it('izvod koji završava poslije sidra nije povijesni', () => {
    expect(isHistoricalBatch({ ...base, batchLastAt: '2026-09-01T11:00:00Z' })).toBe(false);
  });

  it('izvod na isti dan kao sidro tretira se kao povijesni', () => {
    expect(isHistoricalBatch({ ...base, batchLastAt: '2026-08-02T06:00:00Z' })).toBe(true);
  });

  it('bez sidra nije povijesni', () => {
    expect(isHistoricalBatch({ ...base, anchorDate: null, batchLastAt: '2020-01-01T00:00:00Z' })).toBe(false);
  });

  it('bez datuma zadnjeg retka nije povijesni', () => {
    expect(isHistoricalBatch({ ...base, batchLastAt: null })).toBe(false);
  });

  it('DB-ov is_historical ima prednost nad lokalnim izračunom', () => {
    expect(isHistoricalBatch({ ...base, batchLastAt: '2026-09-01T11:00:00Z', isHistorical: true })).toBe(true);
  });
});

describe('shouldReconcile', () => {
  it('BIZNIS AKROBAT: povijesni izvod ne traži odluku iako razlika postoji', () => {
    expect(shouldReconcile({ ...base, batchLastAt: '2026-02-26T11:00:00Z' })).toBe(false);
  });

  it('najnoviji izvod s razlikom traži odluku', () => {
    expect(shouldReconcile({ ...base, batchLastAt: '2026-09-01T11:00:00Z' })).toBe(true);
  });

  it('razlika unutar praga ne traži odluku', () => {
    expect(shouldReconcile({ ...base, delta: 0.004, batchLastAt: '2026-09-01T11:00:00Z' })).toBe(false);
  });

  it('bez bankinog retka nema odluke', () => {
    expect(shouldReconcile({ ...base, hasBankRow: false, batchLastAt: '2026-09-01T11:00:00Z' })).toBe(false);
  });

  it('delta null nema odluke', () => {
    expect(shouldReconcile({ ...base, delta: null, batchLastAt: '2026-09-01T11:00:00Z' })).toBe(false);
  });
});

describe('isHistoricalWithGap', () => {
  it('povijesni izvod s razlikom daje informaciju', () => {
    expect(isHistoricalWithGap({ ...base, batchLastAt: '2026-02-26T11:00:00Z' })).toBe(true);
  });

  it('povijesni izvod bez razlike ne javlja ništa', () => {
    expect(isHistoricalWithGap({ ...base, delta: 0, batchLastAt: '2026-02-26T11:00:00Z' })).toBe(false);
  });

  it('nepovijesni izvod nije informacija nego pitanje', () => {
    expect(isHistoricalWithGap({ ...base, batchLastAt: '2026-09-01T11:00:00Z' })).toBe(false);
  });
});

describe('resolveAsOfIso', () => {
  it('sidro se veže za zadnji redak izvoda, ne za sada', () => {
    const now = '2026-08-02T22:45:00.000Z';
    expect(resolveAsOfIso({ ...base, batchLastAt: '2026-02-26T11:00:00Z' }, now)).toBe('2026-02-26T11:00:00Z');
  });

  it('fallback na now samo kad batch nema datuma', () => {
    const now = '2026-08-02T22:45:00.000Z';
    expect(resolveAsOfIso({ ...base, batchLastAt: null }, now)).toBe(now);
  });
});
