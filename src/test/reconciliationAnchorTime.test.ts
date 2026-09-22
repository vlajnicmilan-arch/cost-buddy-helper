/**
 * KORAK 2 (B) — sidro se nikad ne veže za izmišljeni sat.
 *
 * Redak bez pravog vremena (C3/C4) dobiva od okidača podne po Zagrebu.
 * Sidro s takvog retka mora sjesti na KRAJ tog dana, pa redci istog dana
 * s pravim vremenom (C1/C2) ne mogu procuriti pokraj sidra.
 */
import { describe, it, expect } from 'vitest';
import { endOfZagrebDayIso, hasRealTime, resolveAnchorAsOf } from '@/lib/reconciliation/anchorTime';
import { resolveAsOfIso } from '@/lib/reconciliation/historyGate';

describe('anchorTime — kraj dana po Zagrebu', () => {
  it('ljetno vrijeme (CEST, UTC+2): 17.9. podne → 21:59:59Z istog dana', () => {
    expect(endOfZagrebDayIso('2026-09-17T10:00:00Z')).toBe('2026-09-17T21:59:59.000Z');
  });

  it('zimsko vrijeme (CET, UTC+1): 17.1. podne → 22:59:59Z istog dana', () => {
    expect(endOfZagrebDayIso('2026-01-17T11:00:00Z')).toBe('2026-01-17T22:59:59.000Z');
  });

  it('kasna večer po UTC-u koja je već sutra po Zagrebu ostaje u zagrebačkom danu', () => {
    // 22:30Z u srpnju = 00:30 sljedećeg dana po Zagrebu.
    expect(endOfZagrebDayIso('2026-07-16T22:30:00Z')).toBe('2026-07-17T21:59:59.000Z');
  });

  it('neispravan ulaz → null', () => {
    expect(endOfZagrebDayIso('nije-datum')).toBeNull();
    expect(endOfZagrebDayIso(null)).toBeNull();
  });
});

describe('resolveAnchorAsOf', () => {
  it('C1/C2 zadržava pravo vrijeme retka', () => {
    expect(hasRealTime('C1')).toBe(true);
    expect(resolveAnchorAsOf('2026-09-17T16:48:00Z', 'C2', 'fallback')).toBe('2026-09-17T16:48:00Z');
  });

  it('C3 (izmišljeno podne) ide na kraj dana', () => {
    expect(resolveAnchorAsOf('2026-09-17T10:00:00Z', 'C3', 'fallback')).toBe('2026-09-17T21:59:59.000Z');
  });

  it('nepoznata konfidencija se tretira kao izmišljeno vrijeme', () => {
    expect(resolveAnchorAsOf('2026-09-17T10:00:00Z', null, 'fallback')).toBe('2026-09-17T21:59:59.000Z');
  });

  it('bez timestampa vraća fallback', () => {
    expect(resolveAnchorAsOf(null, 'C1', '2026-09-20T08:00:00Z')).toBe('2026-09-20T08:00:00Z');
  });
});

describe('historyGate.resolveAsOfIso koristi novo pravilo', () => {
  const base = { hasBankRow: true, delta: 5 };

  it('uvezeni bankovni redak (C3) → kraj dana, ne podne', () => {
    const asOf = resolveAsOfIso(
      { ...base, batchLastAt: '2026-09-17T10:00:00Z', batchLastConfidence: 'C3' },
      '2026-09-22T00:00:00Z',
    );
    expect(asOf).toBe('2026-09-17T21:59:59.000Z');
    // Račun u 18:48 po Zagrebu (16:48Z) istog dana pada PRIJE sidra → ne curi.
    expect(new Date('2026-09-17T16:48:00Z') < new Date(asOf)).toBe(true);
  });

  it('redak s pravim vremenom (C1) ostaje nepromijenjen', () => {
    expect(resolveAsOfIso(
      { ...base, batchLastAt: '2026-09-17T16:48:00Z', batchLastConfidence: 'C1' },
      '2026-09-22T00:00:00Z',
    )).toBe('2026-09-17T16:48:00Z');
  });
});
