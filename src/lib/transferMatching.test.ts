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
      makeTransfer({ payment_source: 'uuid-1' as any, income_source_id: 'uuid-2' }),
      customSources
    );
    expect(r?.from.name).toBe('Erste tekući');
    expect(r?.from.color).toBe('#123');
    expect(r?.to.name).toBe('Revolut');
  });

  it('resolves "custom:UUID" prefixed format', () => {
    const r = resolveTransferEndpoints(
      makeTransfer({ payment_source: 'custom:uuid-2' as any, income_source_id: 'custom:uuid-1' }),
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
      makeTransfer({ payment_source: 'unknown-x' as any, income_source_id: 'also-unknown' }),
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

  it('unknown cardId falls through to payment_source resolution', () => {
    const r = resolveTransferEndpoints(
      makeTransfer({ payment_source: 'uuid-2' as any, payment_source_card_id: 'card-ghost' }),
      customSources
    );
    expect(r?.from.name).toBe('Revolut');
    expect(r?.from.cardLast4).toBeUndefined();
  });

  it('"custom:" prefix with unknown uuid falls back to cash', () => {
    const r = resolveTransferEndpoints(
      makeTransfer({ payment_source: 'custom:ghost-uuid' as any, income_source_id: 'cash' }),
      customSources
    );
    expect(r?.from.name).toBe('Gotovina');
    expect(r?.to.name).toBe('Gotovina');
  });

  it('empty-string card_name falls back to parent source name', () => {
    const sources = [
      {
        id: 'uuid-x',
        name: 'PBZ',
        icon: '🏦',
        color: '#abc',
        cards: [{ id: 'card-empty', last_four_digits: '0000', card_name: '' }],
      },
    ];
    const r = resolveTransferEndpoints(
      makeTransfer({ payment_source_card_id: 'card-empty' }),
      sources
    );
    expect(r?.from.name).toBe('PBZ');
    expect(r?.from.cardLast4).toBe('0000');
  });

  it('mixed endpoints: from=card, to=custom UUID', () => {
    const r = resolveTransferEndpoints(
      makeTransfer({ payment_source_card_id: 'card-1', income_source_id: 'custom:uuid-2' }),
      customSources
    );
    expect(r?.from.name).toBe('Glavna Visa');
    expect(r?.from.cardLast4).toBe('1234');
    expect(r?.to.name).toBe('Revolut');
  });

  it('source with no cards array still resolves by sourceId', () => {
    const r = resolveTransferEndpoints(
      makeTransfer({ payment_source: 'uuid-2' as any, payment_source_card_id: 'card-1' }),
      [{ id: 'uuid-2', name: 'Revolut', icon: '💳', color: '#456' }]
    );
    expect(r?.from.name).toBe('Revolut');
    expect(r?.from.cardLast4).toBeUndefined();
  });

  it('destination card_id is ignored (only from-side supports cards)', () => {
    const r = resolveTransferEndpoints(
      makeTransfer({
        payment_source: 'cash',
        income_source_id: 'uuid-1',
        // even if a stray destination card existed, function never reads it
      }),
      customSources
    );
    expect(r?.to.name).toBe('Erste tekući');
    expect(r?.to.cardLast4).toBeUndefined();
  });
});
