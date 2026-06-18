import { describe, it, expect } from 'vitest';
import {
  normalizePaymentSource,
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
