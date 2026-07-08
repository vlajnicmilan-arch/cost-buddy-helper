import { describe, it, expect } from 'vitest';
import {
  parseLocaleAmount,
  parseMoneyStrict,
  parseMoneyAllowZero,
  parseMoneySigned,
  sanitizeMoneyKeystroke,
} from '../money';

describe('parseLocaleAmount', () => {
  it('accepts EU decimal with comma', () => {
    expect(parseLocaleAmount('12,50')).toEqual({ valid: true, value: 12.5 });
  });
  it('accepts US decimal with dot', () => {
    expect(parseLocaleAmount('12.50')).toEqual({ valid: true, value: 12.5 });
  });
  it('accepts integer', () => {
    expect(parseLocaleAmount('10')).toEqual({ valid: true, value: 10 });
  });
  it('accepts EU thousands "1.234,56"', () => {
    expect(parseLocaleAmount('1.234,56')).toEqual({ valid: true, value: 1234.56 });
  });
  it('accepts US thousands "1,234.56"', () => {
    expect(parseLocaleAmount('1,234.56')).toEqual({ valid: true, value: 1234.56 });
  });
  it('accepts EU thousands only "1.234.567"', () => {
    expect(parseLocaleAmount('1.234.567')).toEqual({ valid: true, value: 1234567 });
  });
  it('accepts US thousands only "1,234,567"', () => {
    expect(parseLocaleAmount('1,234,567')).toEqual({ valid: true, value: 1234567 });
  });
  it('accepts negative amount', () => {
    expect(parseLocaleAmount('-5,50')).toEqual({ valid: true, value: -5.5 });
  });
  it('strips currency symbol and whitespace', () => {
    expect(parseLocaleAmount('€ 12,50')).toEqual({ valid: true, value: 12.5 });
    expect(parseLocaleAmount(' 1.234,56 EUR ')).toEqual({ valid: true, value: 1234.56 });
  });
  it('accepts zero', () => {
    expect(parseLocaleAmount('0')).toEqual({ valid: true, value: 0 });
    expect(parseLocaleAmount('0,00')).toEqual({ valid: true, value: 0 });
  });
  it('rejects empty', () => {
    expect(parseLocaleAmount('').valid).toBe(false);
    expect(parseLocaleAmount('   ').valid).toBe(false);
  });
  it('rejects nonsense', () => {
    expect(parseLocaleAmount('abc').valid).toBe(false);
    expect(parseLocaleAmount('1.2.3.4').valid).toBe(false);
  });
  it('rejects multiple decimal groups "12,34,56"', () => {
    expect(parseLocaleAmount('12,34,56').valid).toBe(false);
  });
  it('rejects "12.34.56" that is not valid EU thousands', () => {
    // "12.34.56" has group lengths 2,2,2 → invalid thousands
    expect(parseLocaleAmount('12.34.56').valid).toBe(false);
  });
  it('rejects lone minus', () => {
    expect(parseLocaleAmount('-').valid).toBe(false);
  });
  it('treats single dot + 3 digits as HR thousands separator', () => {
    expect(parseLocaleAmount('1.234')).toEqual({ valid: true, value: 1234 });
    expect(parseLocaleAmount('12.500')).toEqual({ valid: true, value: 12500 });
    expect(parseLocaleAmount('2.500')).toEqual({ valid: true, value: 2500 });
    expect(parseLocaleAmount('999.000')).toEqual({ valid: true, value: 999000 });
  });
  it('keeps 1-2 decimals as decimal point', () => {
    expect(parseLocaleAmount('12.5')).toEqual({ valid: true, value: 12.5 });
    expect(parseLocaleAmount('12.50')).toEqual({ valid: true, value: 12.5 });
  });
  it('accepts unusual precision "1.2345" as decimal', () => {
    expect(parseLocaleAmount('1.2345')).toEqual({ valid: true, value: 1.2345 });
  });
  it('rejects ambiguous "1,234" (comma + exactly 3 digits)', () => {
    // In HR/EU the comma is the decimal separator, but money never has 3
    // decimals — the input is genuinely ambiguous, so we refuse it.
    expect(parseLocaleAmount('1,234').valid).toBe(false);
    expect(parseLocaleAmount('12,345').valid).toBe(false);
  });
  it('rejects double minus', () => {
    expect(parseLocaleAmount('--5').valid).toBe(false);
  });
});

describe('parseMoneyStrict (positive only)', () => {
  it('rejects zero', () => {
    expect(parseMoneyStrict('0').valid).toBe(false);
    expect(parseMoneyStrict('0,00').valid).toBe(false);
  });
  it('rejects negative', () => {
    expect(parseMoneyStrict('-5').valid).toBe(false);
  });
  it('accepts positive', () => {
    expect(parseMoneyStrict('0,01')).toEqual({ valid: true, value: 0.01 });
    expect(parseMoneyStrict('1.234,56')).toEqual({ valid: true, value: 1234.56 });
  });
});

describe('parseMoneyAllowZero', () => {
  it('accepts zero', () => {
    expect(parseMoneyAllowZero('0')).toEqual({ valid: true, value: 0 });
  });
  it('rejects negative', () => {
    expect(parseMoneyAllowZero('-1').valid).toBe(false);
  });
});

describe('parseMoneySigned', () => {
  it('accepts negatives', () => {
    expect(parseMoneySigned('-12,50')).toEqual({ valid: true, value: -12.5 });
  });
});

describe('sanitizeMoneyKeystroke', () => {
  it('strips letters and symbols', () => {
    expect(sanitizeMoneyKeystroke('a12,50€')).toBe('12,50');
  });
  it('preserves leading minus once', () => {
    expect(sanitizeMoneyKeystroke('-12,50')).toBe('-12,50');
    expect(sanitizeMoneyKeystroke('--12,-50')).toBe('-12,50');
  });
  it('keeps commas and dots', () => {
    expect(sanitizeMoneyKeystroke('1.234,56')).toBe('1.234,56');
  });
});
