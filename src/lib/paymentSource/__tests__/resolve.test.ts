import { describe, it, expect } from 'vitest';
import { resolvePaymentSourceKey, isSamePaymentSource } from '../resolve';

const UUID = '6f8e1234-aaaa-bbbb-cccc-1234567890ab';

describe('resolvePaymentSourceKey', () => {
  it('returns __unknown__ for null/undefined/empty', () => {
    expect(resolvePaymentSourceKey(null)).toBe('__unknown__');
    expect(resolvePaymentSourceKey(undefined)).toBe('__unknown__');
    expect(resolvePaymentSourceKey('')).toBe('__unknown__');
    expect(resolvePaymentSourceKey('   ')).toBe('__unknown__');
  });

  it('collapses raw UUID and custom:UUID to same key', () => {
    expect(resolvePaymentSourceKey(UUID)).toBe(`custom:${UUID}`);
    expect(resolvePaymentSourceKey(`custom:${UUID}`)).toBe(`custom:${UUID}`);
    expect(resolvePaymentSourceKey(UUID.toUpperCase())).toBe(`custom:${UUID}`);
  });

  it('passes built-in slugs through trimmed', () => {
    expect(resolvePaymentSourceKey('cash')).toBe('cash');
    expect(resolvePaymentSourceKey('  bank  ')).toBe('bank');
  });

  it('passes unknown free-text through (legacy passthrough)', () => {
    expect(resolvePaymentSourceKey('Erste kartica')).toBe('Erste kartica');
  });
});

describe('isSamePaymentSource', () => {
  it('matches raw UUID with custom:UUID equivalent', () => {
    expect(isSamePaymentSource(UUID, `custom:${UUID}`)).toBe(true);
  });
  it('does not match different sources', () => {
    expect(isSamePaymentSource('cash', 'bank')).toBe(false);
    expect(isSamePaymentSource(UUID, 'cash')).toBe(false);
  });
  it('treats null/empty/unknown as same bucket', () => {
    expect(isSamePaymentSource(null, '')).toBe(true);
    expect(isSamePaymentSource(null, undefined)).toBe(true);
  });
});
