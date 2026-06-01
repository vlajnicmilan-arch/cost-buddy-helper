import { describe, it, expect } from 'vitest';
import {
  computeIncomeRatio,
  computeEqualRatio,
  applySplitOverride,
  pickIncome,
  projectPeriodEnd,
  type FamilyMemberSplitInput,
} from '../familySplit';

const eur = (a: number, from: string, to: string) => {
  if (from === to) return a;
  // simple test rates: 1 CHF = 1.05 EUR, 1 EUR = 1 EUR
  if (from === 'CHF' && to === 'EUR') return a * 1.05;
  if (from === 'EUR' && to === 'CHF') return a / 1.05;
  return a;
};

const owner = (over: Partial<FamilyMemberSplitInput> = {}): FamilyMemberSplitInput => ({
  userId: 'owner',
  consent: true,
  role: 'owner',
  ...over,
});

describe('pickIncome', () => {
  it('hybrid prefers declared, falls back to auto', () => {
    expect(pickIncome(owner({ declaredIncome: 1000, autoIncome: 800 }), 'hybrid', 'EUR', eur)).toBe(1000);
    expect(pickIncome(owner({ declaredIncome: 0, autoIncome: 800 }), 'hybrid', 'EUR', eur)).toBe(800);
  });

  it('declared mode ignores auto', () => {
    expect(pickIncome(owner({ declaredIncome: 1000, autoIncome: 800 }), 'declared', 'EUR', eur)).toBe(1000);
    expect(pickIncome(owner({ autoIncome: 800 }), 'declared', 'EUR', eur)).toBe(0);
  });

  it('adds monthly_contribution to declared', () => {
    expect(pickIncome(owner({ declaredIncome: 1000, monthlyContribution: 200 }), 'declared', 'EUR', eur)).toBe(1200);
  });

  it('converts declared currency to group currency', () => {
    const v = pickIncome(owner({ declaredIncome: 1000, declaredIncomeCurrency: 'CHF' }), 'declared', 'EUR', eur);
    expect(v).toBeCloseTo(1050, 2);
  });
});

describe('computeIncomeRatio', () => {
  it('two equal earners split 50/50', () => {
    const out = computeIncomeRatio({
      members: [owner({ declaredIncome: 1000 }), owner({ userId: 'b', declaredIncome: 1000 })],
      source: 'declared',
      groupCurrency: 'EUR',
      convert: eur,
    });
    expect(out[0].ratio).toBeCloseTo(0.5, 6);
    expect(out[1].ratio).toBeCloseTo(0.5, 6);
    expect(out[0].ratio + out[1].ratio).toBeCloseTo(1, 9);
  });

  it('proportional 70/30 income → 70/30 ratio', () => {
    const out = computeIncomeRatio({
      members: [
        owner({ declaredIncome: 7000 }),
        owner({ userId: 'b', declaredIncome: 3000 }),
      ],
      source: 'declared',
      groupCurrency: 'EUR',
      convert: eur,
    });
    expect(out[0].ratio).toBeCloseTo(0.7, 6);
    expect(out[1].ratio).toBeCloseTo(0.3, 6);
  });

  it('child with 0 income is excluded as no_income', () => {
    const out = computeIncomeRatio({
      members: [
        owner({ declaredIncome: 1000 }),
        owner({ userId: 'child', declaredIncome: 0 }),
      ],
      source: 'declared',
      groupCurrency: 'EUR',
      convert: eur,
    });
    expect(out[0].ratio).toBe(1);
    expect(out[1].included).toBe(false);
    expect(out[1].excludedReason).toBe('no_income');
  });

  it('member without consent is excluded', () => {
    const out = computeIncomeRatio({
      members: [
        owner({ declaredIncome: 1000 }),
        owner({ userId: 'b', declaredIncome: 1000, consent: false }),
      ],
      source: 'declared',
      groupCurrency: 'EUR',
      convert: eur,
    });
    expect(out[0].ratio).toBe(1);
    expect(out[1].excludedReason).toBe('no_consent');
  });

  it('viewer is always excluded', () => {
    const out = computeIncomeRatio({
      members: [
        owner({ declaredIncome: 1000 }),
        owner({ userId: 'v', declaredIncome: 9999, role: 'viewer' }),
      ],
      source: 'declared',
      groupCurrency: 'EUR',
      convert: eur,
    });
    expect(out[1].excludedReason).toBe('viewer');
  });

  it('returns empty ratios when no eligible income', () => {
    const out = computeIncomeRatio({
      members: [owner({ declaredIncome: 0 }), owner({ userId: 'b', declaredIncome: 0 })],
      source: 'declared',
      groupCurrency: 'EUR',
      convert: eur,
    });
    expect(out.every(r => r.ratio === 0)).toBe(true);
  });

  it('multi-currency: CHF earner converted to EUR group', () => {
    const out = computeIncomeRatio({
      members: [
        owner({ declaredIncome: 1000, declaredIncomeCurrency: 'EUR' }),
        owner({ userId: 'b', declaredIncome: 1000, declaredIncomeCurrency: 'CHF' }),
      ],
      source: 'declared',
      groupCurrency: 'EUR',
      convert: eur,
    });
    // owner: 1000 EUR, b: 1050 EUR → 1000/2050 vs 1050/2050
    expect(out[0].ratio).toBeCloseTo(1000 / 2050, 6);
    expect(out[1].ratio).toBeCloseTo(1050 / 2050, 6);
  });

  it('ratios always sum to exactly 1.0 (last absorbs rest)', () => {
    const out = computeIncomeRatio({
      members: [
        owner({ declaredIncome: 333 }),
        owner({ userId: 'b', declaredIncome: 333 }),
        owner({ userId: 'c', declaredIncome: 333 }),
      ],
      source: 'declared',
      groupCurrency: 'EUR',
      convert: eur,
    });
    const sum = out.reduce((s, r) => s + r.ratio, 0);
    expect(sum).toBe(1);
  });
});

describe('computeEqualRatio', () => {
  it('splits equally across non-viewers', () => {
    const out = computeEqualRatio([
      owner(),
      owner({ userId: 'b' }),
      owner({ userId: 'v', role: 'viewer' }),
    ]);
    expect(out[0].ratio).toBeCloseTo(0.5, 6);
    expect(out[1].ratio).toBeCloseTo(0.5, 6);
    expect(out[2].ratio).toBe(0);
  });
});

describe('applySplitOverride', () => {
  it('normalizes overrides that do not sum to 1', () => {
    const out = applySplitOverride({ a: 30, b: 70 }, ['a', 'b', 'c']);
    expect(out[0].ratio).toBeCloseTo(0.3, 6);
    expect(out[1].ratio).toBeCloseTo(0.7, 6);
    expect(out[2].ratio).toBe(0);
  });

  it('returns zeros when override is empty/null', () => {
    expect(applySplitOverride(null, ['a']).every(r => r.ratio === 0)).toBe(true);
    expect(applySplitOverride({}, ['a']).every(r => r.ratio === 0)).toBe(true);
  });
});

describe('projectPeriodEnd', () => {
  it('linearly projects spending', () => {
    expect(projectPeriodEnd(100, 10, 30)).toBeCloseTo(300, 6);
  });
  it('returns spent if already past period end', () => {
    expect(projectPeriodEnd(500, 31, 30)).toBe(500);
  });
  it('handles zero days elapsed', () => {
    expect(projectPeriodEnd(50, 0, 30)).toBe(50);
  });
  it('handles negative spent as 0', () => {
    expect(projectPeriodEnd(-10, 5, 30)).toBe(0);
  });
});
