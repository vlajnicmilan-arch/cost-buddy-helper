import { describe, it, expect } from 'vitest';
import { resolveTransferEndpoints } from './transferMatching';
import type { Expense } from '@/types/expense';

const customSources = [
  {
    id: 'uuid-1',
    name: 'Erste tekući',
    icon: '🏦',
    color: '#123',
    cards: [
      { id: 'card-1', last_four_digits: '1234', card_name: 'Glavna Visa' },
      { id: 'card-2', last_four_digits: '9999', card_name: null },
    ],
  },
  { id: 'uuid-2', name: 'Revolut', icon: '💳', color: '#456' },
];

const makeTransfer = (over: Partial<Expense>): Expense =>
  ({
    id: 't1',
    type: 'transfer',
    amount: 100,
    date: new Date(),
    payment_source: 'cash',
    payment_source_card_id: null,
    income_source_id: 'bank',
    ...over,
  } as unknown as Expense);

describe('resolveTransferEndpoints', () => {
  it('returns null for non-transfer rows', () => {
    const e = makeTransfer({ type: 'expense' });
    expect(resolveTransferEndpoints(e, customSources)).toBeNull();
  });

  it('resolves standard → standard (cash → bank)', () => {
    const r = resolveTransferEndpoints(makeTransfer({}), customSources);
    expect(r?.from.name).toBe('Gotovina');
    expect(r?.to.name).toBe('Banka');
  });

  it('resolves custom UUID directly (without "custom:" prefix)', () => {
    const r = resolveTransferEndpoints(
      makeTransfer({ payment_source: 'uuid-1', income_source_id: 'uuid-2' }),
      customSources
    );
    expect(r?.from.name).toBe('Erste tekući');
    expect(r?.from.color).toBe('#123');
    expect(r?.to.name).toBe('Revolut');
  });

  it('resolves "custom:UUID" prefixed format', () => {
    const r = resolveTransferEndpoints(
      makeTransfer({ payment_source: 'custom:uuid-2', income_source_id: 'custom:uuid-1' }),
      customSources
    );
    expect(r?.from.name).toBe('Revolut');
    expect(r?.to.name).toBe('Erste tekući');
  });

  it('card id wins over payment_source and exposes last4', () => {
    const r = resolveTransferEndpoints(
      makeTransfer({ payment_source: 'cash', payment_source_card_id: 'card-1' }),
      customSources
    );
    expect(r?.from.name).toBe('Glavna Visa');
    expect(r?.from.cardLast4).toBe('1234');
    expect(r?.from.icon).toBe('🏦');
  });

  it('card without card_name falls back to parent source name', () => {
    const r = resolveTransferEndpoints(
      makeTransfer({ payment_source_card_id: 'card-2' }),
      customSources
    );
    expect(r?.from.name).toBe('Erste tekući');
    expect(r?.from.cardLast4).toBe('9999');
  });

  it('unknown ids fall back to cash', () => {
    const r = resolveTransferEndpoints(
      makeTransfer({ payment_source: 'unknown-x', income_source_id: 'also-unknown' }),
      customSources
    );
    expect(r?.from.name).toBe('Gotovina');
    expect(r?.to.name).toBe('Gotovina');
  });

  it('null/undefined endpoints fall back to cash', () => {
    const r = resolveTransferEndpoints(
      makeTransfer({ payment_source: null as any, income_source_id: null as any }),
      customSources
    );
    expect(r?.from.name).toBe('Gotovina');
    expect(r?.to.name).toBe('Gotovina');
  });

  it('empty customSources list still resolves standard sources', () => {
    const r = resolveTransferEndpoints(makeTransfer({}), []);
    expect(r?.from.name).toBe('Gotovina');
    expect(r?.to.name).toBe('Banka');
  });
});
