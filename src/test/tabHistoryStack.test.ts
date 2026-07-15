import { describe, it, expect } from 'vitest';
import {
  createTabHistory,
  pushTab,
  popTab,
  canPopTab,
  resetTabHistory,
} from '@/lib/tabHistoryStack';

describe('tabHistoryStack', () => {
  it('create postavlja default kao trenutni i prazan stack', () => {
    const h = createTabHistory('overview');
    expect(h.current).toBe('overview');
    expect(h.stack).toEqual([]);
    expect(canPopTab(h)).toBe(false);
  });

  it('create s override current-om', () => {
    const h = createTabHistory('overview', 'decisions');
    expect(h.current).toBe('decisions');
    expect(canPopTab(h)).toBe(true);
  });

  it('pushTab pomiče prethodni na stack i mijenja current', () => {
    let h = createTabHistory('overview');
    h = pushTab(h, 'budget');
    expect(h.current).toBe('budget');
    expect(h.stack).toEqual(['overview']);
    h = pushTab(h, 'decisions');
    expect(h.current).toBe('decisions');
    expect(h.stack).toEqual(['overview', 'budget']);
  });

  it('pushTab s istim tabom je no-op', () => {
    const h = pushTab(createTabHistory('overview'), 'overview');
    expect(h.stack).toEqual([]);
    expect(h.current).toBe('overview');
  });

  it('popTab vraća prethodni tab i skida ga sa stacka', () => {
    let h = createTabHistory('overview');
    h = pushTab(h, 'budget');
    h = pushTab(h, 'decisions');
    const { history, target } = popTab(h);
    expect(target).toBe('budget');
    expect(history.current).toBe('budget');
    expect(history.stack).toEqual(['overview']);
  });

  it('popTab preskače entryje koji su jednaki trenutnom tabu', () => {
    // Simulira stanje s duplikatima (npr. legacy alias resolve).
    const h: import('@/lib/tabHistoryStack').TabHistory = {
      defaultTab: 'overview',
      current: 'decisions',
      stack: ['overview', 'decisions', 'decisions'],
    };
    const { target, history } = popTab(h);
    expect(target).toBe('overview');
    expect(history.stack).toEqual([]);
  });

  it('popTab prazan stack → fallback na defaultTab', () => {
    const h: import('@/lib/tabHistoryStack').TabHistory = {
      defaultTab: 'overview',
      current: 'decisions',
      stack: [],
    };
    const { target, history } = popTab(h);
    expect(target).toBe('overview');
    expect(history.current).toBe('overview');
    expect(history.stack).toEqual([]);
  });

  it('canPopTab true kad current != default', () => {
    let h = createTabHistory('overview');
    expect(canPopTab(h)).toBe(false);
    h = pushTab(h, 'team');
    expect(canPopTab(h)).toBe(true);
  });

  it('resetTabHistory čisti stack i vraća na default (ili zadano)', () => {
    let h = createTabHistory('overview');
    h = pushTab(h, 'budget');
    h = pushTab(h, 'decisions');
    const reset = resetTabHistory(h);
    expect(reset.stack).toEqual([]);
    expect(reset.current).toBe('overview');
    const reset2 = resetTabHistory(h, 'team');
    expect(reset2.current).toBe('team');
  });

  it('cijeli tok: navigacija naprijed i back-back-back', () => {
    let h = createTabHistory('overview');
    h = pushTab(h, 'budget');
    h = pushTab(h, 'team');
    h = pushTab(h, 'decisions');
    // back
    let r = popTab(h); expect(r.target).toBe('team'); h = r.history;
    r = popTab(h); expect(r.target).toBe('budget'); h = r.history;
    r = popTab(h); expect(r.target).toBe('overview'); h = r.history;
    // sada je default → canPop false
    expect(canPopTab(h)).toBe(false);
  });
});
