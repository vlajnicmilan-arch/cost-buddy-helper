import { describe, it, expect } from 'vitest';
import {
  greedyNetting,
  computeEqualShares,
  computeProportionalShares,
} from '@/lib/krugSettlement';

describe('greedyNetting', () => {
  it('returns no transfers when all nets are zero', () => {
    expect(greedyNetting([
      { userId: 'a', net: 0 },
      { userId: 'b', net: 0 },
    ])).toEqual([]);
  });

  it('handles 2 members A owes B', () => {
    const t = greedyNetting([
      { userId: 'a', net: -50 },
      { userId: 'b', net: 50 },
    ]);
    expect(t).toEqual([{ fromUser: 'a', toUser: 'b', amount: 50 }]);
  });

  it('handles 3 members with mixed nets', () => {
    // Total sum = 0
    const t = greedyNetting([
      { userId: 'a', net: -30 },
      { userId: 'b', net: -20 },
      { userId: 'c', net: 50 },
    ]);
    // Both A and B owe C
    expect(t).toHaveLength(2);
    const sum = t.reduce((s, x) => s + x.amount, 0);
    expect(sum).toBeCloseTo(50, 2);
  });

  it('produces ≤ N-1 transfers for N members', () => {
    const nets = [
      { userId: 'a', net: -40 },
      { userId: 'b', net: -30 },
      { userId: 'c', net: 20 },
      { userId: 'd', net: 50 },
    ];
    const t = greedyNetting(nets);
    expect(t.length).toBeLessThanOrEqual(3);
  });

  it('ignores amounts below epsilon', () => {
    const t = greedyNetting([
      { userId: 'a', net: -0.005 },
      { userId: 'b', net: 0.005 },
    ]);
    expect(t).toEqual([]);
  });

  it('is deterministic (stable tie-break)', () => {
    const nets = [
      { userId: 'b', net: -10 },
      { userId: 'a', net: -10 },
      { userId: 'c', net: 20 },
    ];
    const t1 = greedyNetting(nets.map((n) => ({ ...n })));
    const t2 = greedyNetting(nets.map((n) => ({ ...n })));
    expect(t1).toEqual(t2);
  });
});

describe('computeEqualShares', () => {
  it('splits amount evenly', () => {
    const s = computeEqualShares(['a', 'b', 'c', 'd'], 100);
    expect(s.a).toBe(25);
    expect(s.d).toBe(25);
  });

  it('reconstructs sum ≈ amount', () => {
    const s = computeEqualShares(['a', 'b', 'c'], 100);
    const sum = Object.values(s).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 5);
  });

  it('empty members returns empty', () => {
    expect(computeEqualShares([], 100)).toEqual({});
  });
});

describe('computeProportionalShares', () => {
  it('splits by weights', () => {
    const s = computeProportionalShares(['a', 'b'], { a: 3, b: 1 }, 100);
    expect(s.a).toBe(75);
    expect(s.b).toBe(25);
  });

  it('falls back to equal on missing weight', () => {
    const s = computeProportionalShares(['a', 'b', 'c'], { a: 2, b: 1 }, 90);
    expect(s.a).toBe(30);
    expect(s.b).toBe(30);
    expect(s.c).toBe(30);
  });

  it('falls back to equal when sum of weights is 0', () => {
    const s = computeProportionalShares(['a', 'b'], { a: 0, b: 0 }, 50);
    expect(s.a).toBe(25);
    expect(s.b).toBe(25);
  });

  it('handles null/undefined weights as missing', () => {
    const s = computeProportionalShares(['a', 'b'], { a: 5, b: null }, 100);
    expect(s.a).toBe(50);
    expect(s.b).toBe(50);
  });

  it('sum reconstructs amount', () => {
    const s = computeProportionalShares(['a', 'b', 'c'], { a: 1, b: 2, c: 3 }, 120);
    const sum = Object.values(s).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(120, 5);
  });
});
