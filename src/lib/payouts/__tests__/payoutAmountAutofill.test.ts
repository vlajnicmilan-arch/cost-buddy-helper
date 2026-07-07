import { describe, it, expect } from 'vitest';
import {
  formatAutoFillAmount,
  nextAmountFromPreview,
  shouldShowApplyCalcHint,
} from '../payoutAmountAutofill';
import { parseAmountFlexible } from '../../amountValidation';

describe('parseAmountFlexible (money input parsing)', () => {
  it('accepts dot decimal', () => {
    const r = parseAmountFlexible('125.50');
    expect(r.valid).toBe(true);
    expect(r.value).toBe(125.5);
  });

  it('accepts Croatian comma decimal', () => {
    const r = parseAmountFlexible('125,50');
    expect(r.valid).toBe(true);
    expect(r.value).toBe(125.5);
  });

  it('accepts zero (partial/edge)', () => {
    const r = parseAmountFlexible('0');
    expect(r.valid).toBe(true);
    expect(r.value).toBe(0);
  });

  it('rejects empty string', () => {
    expect(parseAmountFlexible('').valid).toBe(false);
    expect(parseAmountFlexible('   ').valid).toBe(false);
  });

  it('rejects negative', () => {
    expect(parseAmountFlexible('-5').valid).toBe(false);
    expect(parseAmountFlexible('-1,50').valid).toBe(false);
  });

  it('rejects non-numeric', () => {
    expect(parseAmountFlexible('abc').valid).toBe(false);
  });
});

describe('formatAutoFillAmount', () => {
  it('formats to 2 decimals', () => {
    expect(formatAutoFillAmount(125)).toBe('125.00');
    expect(formatAutoFillAmount(125.5)).toBe('125.50');
    expect(formatAutoFillAmount(125.555)).toBe('125.56');
  });
  it('returns empty for invalid input', () => {
    expect(formatAutoFillAmount(NaN)).toBe('');
    expect(formatAutoFillAmount(-1)).toBe('');
  });
});

describe('nextAmountFromPreview — dirty flag rules', () => {
  it('auto-fills when field is not dirty', () => {
    const r = nextAmountFromPreview('', false, 200);
    expect(r).toEqual({ nextValue: '200.00', clearDirty: true });
  });

  it('does NOT overwrite user value when dirty', () => {
    const r = nextAmountFromPreview('50', true, 200);
    expect(r).toEqual({ nextValue: '50', clearDirty: false });
  });

  it('leaves value untouched when preview missing', () => {
    const r = nextAmountFromPreview('123', false, null);
    expect(r).toEqual({ nextValue: '123', clearDirty: false });
  });

  it('re-applies preview on period change while not dirty', () => {
    const r1 = nextAmountFromPreview('100.00', false, 100);
    const r2 = nextAmountFromPreview(r1.nextValue, false, 250);
    expect(r2.nextValue).toBe('250.00');
  });
});

describe('shouldShowApplyCalcHint', () => {
  it('true when user value differs from preview', () => {
    expect(shouldShowApplyCalcHint('50', 200)).toBe(true);
    expect(shouldShowApplyCalcHint('50,00', 200)).toBe(true);
  });
  it('false when value matches preview (within rounding tolerance)', () => {
    expect(shouldShowApplyCalcHint('200.00', 200)).toBe(false);
    expect(shouldShowApplyCalcHint('200,00', 200)).toBe(false);
    expect(shouldShowApplyCalcHint('200.001', 200)).toBe(false);
  });
  it('false when no preview', () => {
    expect(shouldShowApplyCalcHint('50', null)).toBe(false);
  });
  it('true when field cannot be parsed and preview exists', () => {
    expect(shouldShowApplyCalcHint('', 100)).toBe(true);
    expect(shouldShowApplyCalcHint('abc', 100)).toBe(true);
  });
});
