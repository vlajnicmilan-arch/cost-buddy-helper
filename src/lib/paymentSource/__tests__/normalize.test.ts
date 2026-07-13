import { describe, it, expect, vi } from 'vitest';
import {
  normalizePaymentSource,
  normalizePaymentSourceWithDbFallback,
  tryNormalizePaymentSource,
  isCanonicalShape,
  PaymentSourceNormalizeError,
} from '../normalize';

const KNOWN = '6f8e1234-aaaa-bbbb-cccc-1234567890ab';
const UNKNOWN = '11111111-2222-3333-4444-555555555555';

const ctx = { knownCustomSourceIds: new Set([KNOWN]) };

describe('normalizePaymentSource', () => {
  it('passes built-in slugs through', () => {
    expect(normalizePaymentSource('cash', ctx)).toBe('cash');
    expect(normalizePaymentSource('bank', ctx)).toBe('bank');
    expect(normalizePaymentSource('visa_gold', ctx)).toBe('visa_gold');
    expect(normalizePaymentSource('other', ctx)).toBe('other');
  });

  it('passes canonical custom:UUID through (lowercased)', () => {
    expect(normalizePaymentSource(`custom:${KNOWN}`, ctx)).toBe(`custom:${KNOWN}`);
    expect(normalizePaymentSource(`custom:${KNOWN.toUpperCase()}`, ctx)).toBe(`custom:${KNOWN}`);
  });

  it('upgrades raw UUID to custom:UUID when known', () => {
    expect(normalizePaymentSource(KNOWN, ctx)).toBe(`custom:${KNOWN}`);
    expect(normalizePaymentSource(KNOWN.toUpperCase(), ctx)).toBe(`custom:${KNOWN}`);
  });

  it('throws unknown_uuid for raw UUID not in known set', () => {
    expect(() => normalizePaymentSource(UNKNOWN, ctx)).toThrow(PaymentSourceNormalizeError);
    try {
      normalizePaymentSource(UNKNOWN, ctx);
    } catch (e) {
      expect((e as PaymentSourceNormalizeError).reason).toBe('unknown_uuid');
    }
  });

  it('throws unknown_uuid for custom:UUID not in known set', () => {
    try {
      normalizePaymentSource(`custom:${UNKNOWN}`, ctx);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as PaymentSourceNormalizeError).reason).toBe('unknown_uuid');
    }
  });

  it('throws empty for null / undefined / empty / whitespace', () => {
    for (const v of [null, undefined, '', '   ']) {
      try {
        normalizePaymentSource(v as any, ctx);
        throw new Error('should have thrown for ' + JSON.stringify(v));
      } catch (e) {
        expect((e as PaymentSourceNormalizeError).reason).toBe('empty');
      }
    }
  });

  it('throws malformed for free-text', () => {
    for (const v of ['Erste kartica', 'PBZ Solin', 'random text', 'BANK', 'Cash']) {
      try {
        normalizePaymentSource(v, ctx);
        throw new Error('should have thrown for ' + v);
      } catch (e) {
        expect((e as PaymentSourceNormalizeError).reason).toBe('malformed');
      }
    }
  });

  it('trims surrounding whitespace before classifying', () => {
    expect(normalizePaymentSource('  cash  ', ctx)).toBe('cash');
    expect(normalizePaymentSource(`  custom:${KNOWN}  `, ctx)).toBe(`custom:${KNOWN}`);
  });
});

describe('tryNormalizePaymentSource', () => {
  it('returns null instead of throwing', () => {
    expect(tryNormalizePaymentSource(UNKNOWN, ctx)).toBeNull();
    expect(tryNormalizePaymentSource('', ctx)).toBeNull();
    expect(tryNormalizePaymentSource('garbage', ctx)).toBeNull();
  });

  it('still returns canonical on success', () => {
    expect(tryNormalizePaymentSource(KNOWN, ctx)).toBe(`custom:${KNOWN}`);
  });
});

describe('isCanonicalShape', () => {
  it('true for built-in slugs and custom:UUID', () => {
    expect(isCanonicalShape('cash')).toBe(true);
    expect(isCanonicalShape(`custom:${KNOWN}`)).toBe(true);
  });
  it('false for raw UUID and free-text', () => {
    expect(isCanonicalShape(KNOWN)).toBe(false);
    expect(isCanonicalShape('Erste')).toBe(false);
    expect(isCanonicalShape('')).toBe(false);
  });
});

describe('normalizePaymentSourceWithDbFallback', () => {
  it('sretni put: built-in slug — nula DB poziva', async () => {
    const db = vi.fn(async () => true);
    expect(await normalizePaymentSourceWithDbFallback('cash', ctx, db)).toBe('cash');
    expect(db).not.toHaveBeenCalled();
  });

  it('sretni put: custom:UUID u known setu — nula DB poziva', async () => {
    const db = vi.fn(async () => true);
    expect(await normalizePaymentSourceWithDbFallback(`custom:${KNOWN}`, ctx, db)).toBe(`custom:${KNOWN}`);
    expect(await normalizePaymentSourceWithDbFallback(KNOWN, ctx, db)).toBe(`custom:${KNOWN}`);
    expect(db).not.toHaveBeenCalled();
  });

  it('unknown_uuid + DB pogodak → canonical custom:UUID', async () => {
    const db = vi.fn(async (uuid: string) => {
      expect(uuid).toBe(UNKNOWN);
      return true;
    });
    expect(await normalizePaymentSourceWithDbFallback(`custom:${UNKNOWN}`, ctx, db)).toBe(`custom:${UNKNOWN}`);
    expect(db).toHaveBeenCalledTimes(1);
  });

  it('unknown_uuid + DB pogodak za raw UUID (bez custom: prefiksa) → canonical', async () => {
    const db = vi.fn(async () => true);
    expect(await normalizePaymentSourceWithDbFallback(UNKNOWN, ctx, db)).toBe(`custom:${UNKNOWN}`);
    expect(db).toHaveBeenCalledWith(UNKNOWN);
  });

  it('unknown_uuid + DB promašaj → re-throw unknown_uuid (reason nepromijenjen)', async () => {
    const db = vi.fn(async () => false);
    await expect(normalizePaymentSourceWithDbFallback(`custom:${UNKNOWN}`, ctx, db))
      .rejects.toBeInstanceOf(PaymentSourceNormalizeError);
    try {
      await normalizePaymentSourceWithDbFallback(`custom:${UNKNOWN}`, ctx, db);
    } catch (e) {
      expect((e as PaymentSourceNormalizeError).reason).toBe('unknown_uuid');
    }
  });

  it('non-uuid greške (empty/malformed) NE zovu DB fallback — re-throw direktno', async () => {
    const db = vi.fn(async () => true);
    await expect(normalizePaymentSourceWithDbFallback('', ctx, db)).rejects.toMatchObject({ reason: 'empty' });
    await expect(normalizePaymentSourceWithDbFallback('Erste', ctx, db)).rejects.toMatchObject({ reason: 'malformed' });
    expect(db).not.toHaveBeenCalled();
  });
});
