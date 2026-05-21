import { describe, it, expect } from 'vitest';
import { localMatch, calculatePreviousDueDate } from './recurringMatching';
import type { RecurringTransaction } from '@/hooks/useRecurringTransactions';

const rec = (over: Partial<RecurringTransaction>): RecurringTransaction =>
  ({
    id: 'r1',
    user_id: 'u1',
    description: 'Netflix pretplata',
    merchant_name: 'Netflix',
    amount: 12.99,
    type: 'expense',
    frequency: 'monthly',
    next_due_date: '2026-06-15',
    is_active: true,
    ...over,
  } as unknown as RecurringTransaction);

describe('calculatePreviousDueDate', () => {
  it('subtracts one month for monthly', () => {
    const d = calculatePreviousDueDate('2026-06-15', 'monthly');
    expect(d?.toISOString().slice(0, 10)).toBe('2026-05-15');
  });

  it('subtracts 7 days for weekly', () => {
    const d = calculatePreviousDueDate('2026-06-15', 'weekly');
    expect(d?.toISOString().slice(0, 10)).toBe('2026-06-08');
  });

  it('subtracts 14 days for biweekly', () => {
    const d = calculatePreviousDueDate('2026-06-15', 'biweekly');
    expect(d?.toISOString().slice(0, 10)).toBe('2026-06-01');
  });

  it('subtracts 3 months for quarterly', () => {
    const d = calculatePreviousDueDate('2026-06-15', 'quarterly');
    expect(d?.toISOString().slice(0, 10)).toBe('2026-03-15');
  });

  it('subtracts 6 months for semi-annually', () => {
    const d = calculatePreviousDueDate('2026-06-15', 'semi-annually');
    expect(d?.toISOString().slice(0, 10)).toBe('2025-12-15');
  });

  it('subtracts 1 year for yearly', () => {
    const d = calculatePreviousDueDate('2026-06-15', 'yearly');
    expect(d?.toISOString().slice(0, 10)).toBe('2025-06-15');
  });

  it('defaults unknown frequency to monthly', () => {
    const d = calculatePreviousDueDate('2026-06-15', 'lunar');
    expect(d?.toISOString().slice(0, 10)).toBe('2026-05-15');
  });

  it('returns null for invalid date', () => {
    expect(calculatePreviousDueDate('not-a-date', 'monthly')).toBeNull();
  });
});

describe('localMatch — basics', () => {
  it('matches an exact tx near next_due_date', () => {
    const tx = { description: 'Netflix', amount: 12.99, type: 'expense', date: '2026-06-14' };
    const m = localMatch(tx, [rec({})]);
    expect(m).not.toBeNull();
    expect(m?.confidence).toBe('high');
    expect(m?.source).toBe('local');
  });

  it('returns null when no recurring is active', () => {
    const tx = { description: 'Netflix', amount: 12.99, type: 'expense', date: '2026-06-14' };
    expect(localMatch(tx, [rec({ is_active: false })])).toBeNull();
  });

  it('returns null when type differs', () => {
    const tx = { description: 'Netflix', amount: 12.99, type: 'income', date: '2026-06-14' };
    expect(localMatch(tx, [rec({})])).toBeNull();
  });

  it('rejects amount delta above 0.1% tolerance', () => {
    const tx = { description: 'Netflix', amount: 13.5, type: 'expense', date: '2026-06-14' };
    expect(localMatch(tx, [rec({})])).toBeNull();
  });

  it('accepts floating-point noise within 0.1%', () => {
    const tx = { description: 'Netflix', amount: 12.9900001, type: 'expense', date: '2026-06-14' };
    expect(localMatch(tx, [rec({})])).not.toBeNull();
  });

  it('matches via merchant_name when description differs', () => {
    const tx = { description: 'Netflix EU billing', amount: 12.99, type: 'expense', date: '2026-06-14' };
    const m = localMatch(tx, [rec({ description: 'Streaming', merchant_name: 'Netflix' })]);
    expect(m).not.toBeNull();
  });
});

describe('localMatch — backward date logic', () => {
  it('matches against previous monthly due (historical import)', () => {
    const tx = { description: 'Netflix', amount: 12.99, type: 'expense', date: '2026-05-15' };
    const m = localMatch(tx, [rec({ next_due_date: '2026-06-15', frequency: 'monthly' })]);
    expect(m).not.toBeNull();
  });

  it('returns medium confidence (not null) when date is far from any due date', () => {
    // Date proximity is a confidence booster only — it does not reject the match
    const tx = { description: 'Netflix', amount: 12.99, type: 'expense', date: '2026-05-01' };
    const m = localMatch(tx, [rec({ next_due_date: '2026-06-15', frequency: 'monthly' })]);
    expect(m).not.toBeNull();
    expect(m?.confidence).toBe('medium');
  });


  it('downgrades to medium confidence when date is far from due', () => {
    // No next_due_date → dateClose stays false → medium even with exact desc+amount
    const tx = { description: 'Netflix', amount: 12.99, type: 'expense', date: '2026-06-14' };
    const m = localMatch(tx, [rec({ next_due_date: null as any })]);
    expect(m?.confidence).toBe('medium');
  });
});

describe('localMatch — multi-candidate', () => {
  it('returns the first matching active recurring', () => {
    const tx = { description: 'Netflix', amount: 12.99, type: 'expense', date: '2026-06-14' };
    const a = rec({ id: 'a' });
    const b = rec({ id: 'b' });
    const m = localMatch(tx, [a, b]);
    expect(m?.recurring.id).toBe('a');
  });

  it('skips non-matching candidates and returns the matching one', () => {
    const tx = { description: 'Netflix', amount: 12.99, type: 'expense', date: '2026-06-14' };
    const wrongAmount = rec({ id: 'wrong', amount: 50 });
    const right = rec({ id: 'right' });
    const m = localMatch(tx, [wrongAmount, right]);
    expect(m?.recurring.id).toBe('right');
  });
});
