import { describe, it, expect } from 'vitest';
import {
  detectDuplicate,
  normalizeMerchant,
  areMerchantsSimilar,
  levenshtein,
  type NewTxInput,
} from './duplicateDetection';
import type { Expense } from '@/types/expense';

const baseExpense = (overrides: Partial<Expense>): Expense =>
  ({
    id: 'e1',
    user_id: 'u1',
    amount: 50,
    description: 'Konzum kupovina',
    category: 'food',
    date: new Date('2026-05-10T10:00:00Z'),
    type: 'expense',
    payment_source: 'cash',
    merchant_name: 'Konzum d.o.o.',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as unknown as Expense);

const baseTx = (overrides: Partial<NewTxInput>): NewTxInput => ({
  amount: 50,
  type: 'expense',
  date: new Date('2026-05-10T20:00:00Z'),
  description: 'Konzum kupovina',
  merchant_name: 'Konzum',
  payment_source: 'cash',
  ...overrides,
});

describe('duplicateDetection — helpers', () => {
  it('normalizes merchants by stripping suffixes, diacritics and store numbers', () => {
    expect(normalizeMerchant('Konzum d.o.o. Zagreb 045')).toBe('konzum zagreb');
    expect(normalizeMerchant('KONZUM ZAGREB 045')).toBe('konzum zagreb');
    expect(normalizeMerchant('Šibenska pekara')).toBe('sibenska pekara');
  });

  it('matches similar merchants across formatting variants', () => {
    expect(areMerchantsSimilar('Konzum d.o.o. Zagreb', 'KONZUM ZAGREB 045')).toBe(true);
    expect(areMerchantsSimilar('Konzum', 'Lidl')).toBe(false);
  });

  it('levenshtein basics', () => {
    expect(levenshtein('konzum', 'konzun')).toBe(1);
    expect(levenshtein('konzum', 'kanzum')).toBe(1);
    expect(levenshtein('abc', 'xyz')).toBe(3);
  });
});

describe('duplicateDetection — levels', () => {
  it('STRICT: exact amount + same day + same merchant + same source → manual mode', () => {
    const existing = baseExpense({});
    const result = detectDuplicate(baseTx({}), [existing], {
      ignoreSameDayDuplicateGuard: false,
    });
    expect(result.level).toBe('strict');
    expect(result.confidence).toBeGreaterThanOrEqual(90);
    expect(result.match?.id).toBe('e1');
  });

  it('FUZZY: exact amount + same merchant but 3 days apart', () => {
    const existing = baseExpense({ date: new Date('2026-05-08T10:00:00Z') });
    const result = detectDuplicate(baseTx({}), [existing], { ignoreSameDayDuplicateGuard: true });
    expect(result.level).toBe('fuzzy');
    expect(result.confidence).toBeGreaterThanOrEqual(60);
    expect(result.confidence).toBeLessThan(90);
  });

  it('SUSPICIOUS: ~3% amount diff, same week, near-identical merchant', () => {
    const existing = baseExpense({
      amount: 51.5,
      date: new Date('2026-05-08T10:00:00Z'),
      merchant_name: 'Konzun',
    });
    const result = detectDuplicate(baseTx({}), [existing], { ignoreSameDayDuplicateGuard: true });
    expect(result.level).toBe('suspicious');
    expect(result.confidence).toBeGreaterThanOrEqual(30);
    expect(result.confidence).toBeLessThan(60);
  });

  it('UNIQUE: completely different transaction', () => {
    const existing = baseExpense({ amount: 200, merchant_name: 'Lidl' });
    const result = detectDuplicate(
      baseTx({ amount: 12, merchant_name: 'Tisak' }),
      [existing],
      { ignoreSameDayDuplicateGuard: true }
    );
    expect(result.level).toBe('unique');
    expect(result.confidence).toBe(0);
    expect(result.match).toBeNull();
  });
});

describe('duplicateDetection — edge cases', () => {
  it('CSV import: two identical Konzum purchases same day → SUSPICIOUS, not strict', () => {
    const morning = baseExpense({ date: new Date('2026-05-10T08:00:00Z') });
    const evening = baseTx({ date: new Date('2026-05-10T20:00:00Z') });
    const result = detectDuplicate(evening, [morning], { ignoreSameDayDuplicateGuard: true });
    expect(result.level).toBe('suspicious');
  });

  it('Manual entry: same Konzum same day → STRICT (double-click guard)', () => {
    const existing = baseExpense({ date: new Date('2026-05-10T08:00:00Z') });
    const dup = baseTx({ date: new Date('2026-05-10T08:00:05Z') });
    const result = detectDuplicate(dup, [existing], { ignoreSameDayDuplicateGuard: false });
    expect(result.level).toBe('strict');
  });

  it('Different transaction type never matches as strict', () => {
    const existing = baseExpense({ type: 'income' as any });
    const result = detectDuplicate(baseTx({ type: 'expense' }), [existing], {
      ignoreSameDayDuplicateGuard: false,
    });
    expect(result.level).toBe('unique');
  });

  it('Different store of same chain with different amount → UNIQUE', () => {
    const existing = baseExpense({
      amount: 80,
      merchant_name: 'Konzum Split',
      date: new Date('2026-05-10T10:00:00Z'),
    });
    const result = detectDuplicate(
      baseTx({ amount: 50, merchant_name: 'Konzum Zagreb' }),
      [existing],
      { ignoreSameDayDuplicateGuard: true }
    );
    // Amount differs by 60% → not strict, not fuzzy. Could be suspicious only if
    // within 5%, which fails — so unique.
    expect(result.level).toBe('unique');
  });

  it('Exact amount, same day, same merchant, DIFFERENT payment source → fuzzy', () => {
    const existing = baseExpense({ payment_source: 'cash' });
    const result = detectDuplicate(
      baseTx({ payment_source: 'custom:abc' }),
      [existing],
      { ignoreSameDayDuplicateGuard: false }
    );
    expect(result.level).toBe('fuzzy');
  });

  it('Returns the strongest match when multiple candidates exist', () => {
    const weak = baseExpense({ id: 'weak', amount: 49, date: new Date('2026-05-08T10:00:00Z') });
    const strong = baseExpense({ id: 'strong' });
    const result = detectDuplicate(baseTx({}), [weak, strong], {
      ignoreSameDayDuplicateGuard: false,
    });
    expect(result.match?.id).toBe('strong');
  });
});
