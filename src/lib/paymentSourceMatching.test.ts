import { describe, it, expect } from 'vitest';
import { matchCustomByMethod } from './paymentSourceMatching';
import type { CustomPaymentSource } from '@/types/customPaymentSource';

const src = (name: string): CustomPaymentSource =>
  ({ id: `id-${name}`, name, icon: '💳', color: '#000' } as unknown as CustomPaymentSource);

describe('matchCustomByMethod', () => {
  it('returns null for empty source list', () => {
    expect(matchCustomByMethod('cash', [])).toBeNull();
  });

  it('matches Croatian "Gotovina" for cash', () => {
    const sources = [src('Gotovina'), src('Revolut')];
    expect(matchCustomByMethod('cash', sources)?.name).toBe('Gotovina');
  });

  it('matches German "Bargeld" for cash', () => {
    expect(matchCustomByMethod('cash', [src('Bargeld')])?.name).toBe('Bargeld');
  });

  it('is case-insensitive and strips diacritics', () => {
    expect(matchCustomByMethod('cash', [src('GOTOVINA')])?.name).toBe('GOTOVINA');
    expect(matchCustomByMethod('bank', [src('ŽirorAčun')])?.name).toBe('Žirorčun');
  });

  it('matches card synonyms (visa, maestro, kreditna…)', () => {
    expect(matchCustomByMethod('card', [src('Visa')])?.name).toBe('Visa');
    expect(matchCustomByMethod('card', [src('Maestro')])?.name).toBe('Maestro');
    expect(matchCustomByMethod('card', [src('Kreditna')])?.name).toBe('Kreditna');
  });

  it('matches bank synonyms', () => {
    expect(matchCustomByMethod('bank', [src('Banka')])?.name).toBe('Banka');
    expect(matchCustomByMethod('bank', [src('Tekuci')])?.name).toBe('Tekuci');
  });

  it('returns null when nothing matches', () => {
    expect(matchCustomByMethod('cash', [src('Revolut'), src('Crypto')])).toBeNull();
  });

  it('does not cross categories (cash query should not match a card-named source)', () => {
    expect(matchCustomByMethod('cash', [src('Visa')])).toBeNull();
  });

  it('returns the first matching source when several qualify', () => {
    const sources = [src('Kartica'), src('Visa')];
    const result = matchCustomByMethod('card', sources);
    expect(result?.name).toBe('Kartica');
  });

  it('trims whitespace in source names', () => {
    expect(matchCustomByMethod('cash', [src('  gotovina  ')])?.name).toBe('  gotovina  ');
  });
});
