import { describe, it, expect } from 'vitest';
import { validateAiRecurringMatch } from '../validateAiRecurringMatch';

const rec = (over: Partial<Parameters<typeof validateAiRecurringMatch>[1]> = {}) => ({
  description: 'Netflix pretplata',
  merchant_name: 'Netflix',
  amount: 12.99,
  type: 'expense',
  ...over,
});

describe('validateAiRecurringMatch — amount tolerance (0.1%)', () => {
  it('accepts identical amount', () => {
    const r = validateAiRecurringMatch(
      { description: 'Netflix', amount: 12.99, type: 'expense' },
      rec()
    );
    expect(r.accept).toBe(true);
  });

  it('accepts floating-point noise within 0.1%', () => {
    const r = validateAiRecurringMatch(
      { description: 'Netflix', amount: 12.9900001, type: 'expense' },
      rec()
    );
    expect(r.accept).toBe(true);
  });

  it('rejects amount delta above 0.1%', () => {
    const r = validateAiRecurringMatch(
      { description: 'Netflix', amount: 13.5, type: 'expense' },
      rec()
    );
    expect(r.accept).toBe(false);
    expect(r.reason).toBe('amount');
  });

  it('rejects amount just above tolerance edge', () => {
    // 12.99 * 1.002 = 13.01598 → > 0.1%
    const r = validateAiRecurringMatch(
      { description: 'Netflix', amount: 13.02, type: 'expense' },
      rec()
    );
    expect(r.accept).toBe(false);
    expect(r.reason).toBe('amount');
  });

  it('treats negative tx amount as absolute value', () => {
    const r = validateAiRecurringMatch(
      { description: 'Netflix', amount: -12.99, type: 'expense' },
      rec()
    );
    expect(r.accept).toBe(true);
  });

  it('handles near-zero recurring amount without division by zero', () => {
    const r = validateAiRecurringMatch(
      { description: 'Test', amount: 0, type: 'expense' },
      rec({ amount: 0, description: 'Test' })
    );
    expect(r.accept).toBe(true);
  });
});

describe('validateAiRecurringMatch — type match', () => {
  it('rejects when types differ', () => {
    const r = validateAiRecurringMatch(
      { description: 'Netflix', amount: 12.99, type: 'income' },
      rec()
    );
    expect(r.accept).toBe(false);
    expect(r.reason).toBe('type');
  });

  it('amount mismatch is reported before type mismatch', () => {
    const r = validateAiRecurringMatch(
      { description: 'Netflix', amount: 99, type: 'income' },
      rec()
    );
    expect(r.accept).toBe(false);
    expect(r.reason).toBe('amount');
  });
});

describe('validateAiRecurringMatch — word overlap (≥3 chars)', () => {
  it('rejects when no word overlap exists', () => {
    const r = validateAiRecurringMatch(
      { description: 'Konzum kupovina', amount: 12.99, type: 'expense' },
      rec()
    );
    expect(r.accept).toBe(false);
    expect(r.reason).toBe('word_overlap');
  });

  it('accepts when description shares a word with recurring description', () => {
    const r = validateAiRecurringMatch(
      { description: 'Netflix billing EU', amount: 12.99, type: 'expense' },
      rec()
    );
    expect(r.accept).toBe(true);
  });

  it('accepts via merchant_name even when descriptions differ', () => {
    const r = validateAiRecurringMatch(
      { description: 'Mjesečna pretplata', amount: 12.99, type: 'expense' },
      rec({ description: 'Streaming servis', merchant_name: 'pretplata' })
    );
    expect(r.accept).toBe(true);
  });

  it('ignores 1-2 char tokens', () => {
    const r = validateAiRecurringMatch(
      { description: 'EU a b c', amount: 12.99, type: 'expense' },
      rec({ description: 'EU', merchant_name: '' })
    );
    // EU = 2 chars → filtered out → no overlap
    expect(r.accept).toBe(false);
    expect(r.reason).toBe('word_overlap');
  });

  it('matches via bidirectional substring (tx word inside rec word)', () => {
    const r = validateAiRecurringMatch(
      { description: 'net', amount: 12.99, type: 'expense' },
      rec({ description: 'netflix', merchant_name: '' })
    );
    expect(r.accept).toBe(true);
  });

  it('matches via bidirectional substring (rec word inside tx word)', () => {
    const r = validateAiRecurringMatch(
      { description: 'netflix-eu', amount: 12.99, type: 'expense' },
      rec({ description: 'net', merchant_name: '' })
    );
    // tokens: tx=['netflix-eu'], rec=['net'] → 'netflix-eu'.includes('net') ✓
    expect(r.accept).toBe(true);
  });

  it('is case-insensitive', () => {
    const r = validateAiRecurringMatch(
      { description: 'NETFLIX', amount: 12.99, type: 'expense' },
      rec({ description: 'netflix' })
    );
    expect(r.accept).toBe(true);
  });

  it('handles null merchant_name gracefully', () => {
    const r = validateAiRecurringMatch(
      { description: 'Netflix', amount: 12.99, type: 'expense' },
      rec({ merchant_name: null })
    );
    expect(r.accept).toBe(true);
  });
});

describe('validateAiRecurringMatch — confidence override', () => {
  it('returns "high" when tx description is full substring of rec description', () => {
    const r = validateAiRecurringMatch(
      { description: 'netflix', amount: 12.99, type: 'expense' },
      rec({ description: 'netflix pretplata', merchant_name: '' })
    );
    expect(r.accept).toBe(true);
    expect(r.confidence).toBe('high');
  });

  it('returns "high" when rec description is substring of tx', () => {
    const r = validateAiRecurringMatch(
      { description: 'netflix pretplata mjesečna', amount: 12.99, type: 'expense' },
      rec({ description: 'netflix pretplata', merchant_name: '' })
    );
    expect(r.confidence).toBe('high');
  });

  it('returns "high" via merchant substring', () => {
    const r = validateAiRecurringMatch(
      { description: 'netflix', amount: 12.99, type: 'expense' },
      rec({ description: 'streaming', merchant_name: 'netflix' })
    );
    expect(r.confidence).toBe('high');
  });

  it('returns "medium" when only word overlap matches (no full substring)', () => {
    const r = validateAiRecurringMatch(
      { description: 'Netflix EU billing department', amount: 12.99, type: 'expense' },
      rec({ description: 'Netflix pretplata', merchant_name: '' })
    );
    expect(r.accept).toBe(true);
    expect(r.confidence).toBe('medium');
  });

  it('ignores empty merchant for confidence', () => {
    const r = validateAiRecurringMatch(
      { description: 'random text netflix-something extra', amount: 12.99, type: 'expense' },
      rec({ description: 'netflix', merchant_name: '' })
    );
    // 'netflix' not full substring of tx, tx not substring of 'netflix' → medium
    expect(r.accept).toBe(true);
    expect(r.confidence).toBe('medium');
  });

  it('trims whitespace before substring check', () => {
    const r = validateAiRecurringMatch(
      { description: '  netflix  ', amount: 12.99, type: 'expense' },
      rec({ description: '  netflix pretplata  ', merchant_name: '' })
    );
    expect(r.confidence).toBe('high');
  });
});

describe('validateAiRecurringMatch — rejection always carries medium confidence', () => {
  it('amount rejection → medium', () => {
    const r = validateAiRecurringMatch(
      { description: 'Netflix', amount: 999, type: 'expense' },
      rec()
    );
    expect(r.confidence).toBe('medium');
  });

  it('type rejection → medium', () => {
    const r = validateAiRecurringMatch(
      { description: 'Netflix', amount: 12.99, type: 'income' },
      rec()
    );
    expect(r.confidence).toBe('medium');
  });
});
