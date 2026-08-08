import { describe, it, expect } from 'vitest';
import { rebalanceShares, formatShare } from '@/lib/krugSplitRebalance';

const sum = (v: Record<string, number>) =>
  +Object.values(v).reduce((a, b) => a + b, 0).toFixed(2);

describe('rebalanceShares — 2 člana', () => {
  const ids = ['a', 'b'];

  it('upis 70 u prvo polje → drugo postaje 30', () => {
    const { values, error } = rebalanceShares({ a: 70, b: 50 }, ids, ['a']);
    expect(error).toBeNull();
    expect(values).toEqual({ a: 70, b: 30 });
    expect(sum(values)).toBe(100);
  });

  it('upis 70 u drugo polje → prvo postaje 30 (obrnuti smjer)', () => {
    const { values } = rebalanceShares({ a: 50, b: 70 }, ids, ['b']);
    expect(values).toEqual({ a: 30, b: 70 });
    expect(sum(values)).toBe(100);
  });

  it('bez dirnutih polja → jednaka podjela', () => {
    const { values } = rebalanceShares({ a: 0, b: 0 }, ids, []);
    expect(values).toEqual({ a: 50, b: 50 });
  });
});

describe('rebalanceShares — 3+ članova', () => {
  const ids = ['a', 'b', 'c'];

  it('upis 50 na jednom → ostala dva razmjerno, zbroj točno 100.00', () => {
    // dotadašnji omjeri b:c = 20:40 → 1:2 od preostalih 50 → 16.67 / 33.33
    const { values } = rebalanceShares({ a: 50, b: 20, c: 40 }, ids, ['a']);
    expect(values.a).toBe(50);
    expect(values.b).toBe(16.67);
    expect(values.c).toBe(33.33);
    expect(sum(values)).toBe(100);
  });

  it('zaokruživanje: jednaki nedirnuti → 33.33/33.33/33.34 (zadnji apsorbira lom)', () => {
    const { values } = rebalanceShares({ a: 0, b: 0, c: 0 }, ids, []);
    expect(values.a).toBe(33.33);
    expect(values.b).toBe(33.33);
    expect(values.c).toBe(33.34);
    expect(sum(values)).toBe(100);
  });

  it('dirnuta polja se NE prepisuju', () => {
    const { values } = rebalanceShares({ a: 40, b: 25, c: 10 }, ids, ['a', 'b']);
    expect(values.a).toBe(40);
    expect(values.b).toBe(25);
    expect(values.c).toBe(35);
    expect(sum(values)).toBe(100);
  });

  it('dirnuta polja preko 100 → inline greška, vrijednosti netaknute', () => {
    const { values, error } = rebalanceShares({ a: 70, b: 60, c: 10 }, ids, ['a', 'b']);
    expect(error).toBe('touched_over_100');
    expect(values.a).toBe(70);
    expect(values.b).toBe(60);
  });

  it('sva polja dirnuta → ostaju kakva jesu (server je zadnja brana)', () => {
    const { values, error } = rebalanceShares({ a: 30, b: 30, c: 30 }, ids, ids);
    expect(error).toBeNull();
    expect(values).toEqual({ a: 30, b: 30, c: 30 });
  });

  it('4 člana: 25 fiksno, ostatak po dotadašnjim omjerima, zbroj 100.00', () => {
    const q = ['a', 'b', 'c', 'd'];
    const { values } = rebalanceShares({ a: 25, b: 10, c: 10, d: 5 }, q, ['a']);
    expect(values.a).toBe(25);
    expect(sum(values)).toBe(100);
  });
});

describe('formatShare', () => {
  it('reže suvišne nule', () => {
    expect(formatShare(30)).toBe('30');
    expect(formatShare(33.335)).toBe('33.34');
  });
});
