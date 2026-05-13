import { describe, it, expect } from 'vitest';
import { validateAmountInput, normalizeAmountInput } from './amountValidation';

describe('normalizeAmountInput', () => {
  it('replaces comma with dot', () => {
    expect(normalizeAmountInput('12,50')).toBe('12.50');
  });

  it('leaves dot untouched', () => {
    expect(normalizeAmountInput('12.50')).toBe('12.50');
  });

  it('handles empty string', () => {
    expect(normalizeAmountInput('')).toBe('');
  });
});

describe('validateAmountInput (used in AddExpenseDialog)', () => {
  it('rejects 0', () => {
    expect(validateAmountInput('0').valid).toBe(false);
  });

  it('rejects 0.00', () => {
    expect(validateAmountInput('0.00').valid).toBe(false);
    expect(validateAmountInput('0,00').valid).toBe(false);
  });

  it('rejects negative numbers', () => {
    expect(validateAmountInput('-5').valid).toBe(false);
    expect(validateAmountInput('-0.01').valid).toBe(false);
    expect(validateAmountInput('-12,50').valid).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateAmountInput('').valid).toBe(false);
  });

  it('rejects non-numeric input', () => {
    expect(validateAmountInput('abc').valid).toBe(false);
  });

  it('accepts positive integer', () => {
    const r = validateAmountInput('10');
    expect(r.valid).toBe(true);
    expect(r.value).toBe(10);
  });

  it('accepts positive decimal with dot', () => {
    const r = validateAmountInput('12.50');
    expect(r.valid).toBe(true);
    expect(r.value).toBe(12.5);
  });

  it('converts comma to dot for decimals', () => {
    const r = validateAmountInput('12,50');
    expect(r.valid).toBe(true);
    expect(r.value).toBe(12.5);
  });

  it('accepts very small positive amount', () => {
    const r = validateAmountInput('0,01');
    expect(r.valid).toBe(true);
    expect(r.value).toBe(0.01);
  });
});
