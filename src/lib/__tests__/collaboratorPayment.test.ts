import { describe, expect, it } from 'vitest';
import {
  canPay,
  groupPaymentsForDisplay,
  livePayments,
  paidFromPayments,
  remainingForCollaborator,
  type CollaboratorPaymentRow,
} from '@/lib/collaboratorPayment';

const pay = (over: Partial<CollaboratorPaymentRow> & { id: string; amount: number; paid_at: string }): CollaboratorPaymentRow => ({
  collaborator_id: 'c1',
  project_id: 'p1',
  payment_source: 'custom:w1',
  status: 'paid',
  ...over,
});

describe('remainingForCollaborator', () => {
  it('caps at the agreed amount minus legacy and live payments', () => {
    expect(
      remainingForCollaborator({
        totalPrice: 1000,
        legacyPaid: 200,
        payments: [pay({ id: '1', amount: 300, paid_at: '2026-07-01T10:00:00Z' })],
      }),
    ).toBe(500);
  });

  it('returns null when the agreed amount was never entered', () => {
    expect(remainingForCollaborator({ totalPrice: 0, legacyPaid: 0, payments: [] })).toBeNull();
    expect(
      remainingForCollaborator({
        totalPrice: 0,
        legacyPaid: 120,
        payments: [pay({ id: '1', amount: 80, paid_at: '2026-07-01T10:00:00Z' })],
      }),
    ).toBeNull();
  });

  it('gives the amount back when a payment is voided', () => {
    const payments = [
      pay({ id: '1', amount: 300, paid_at: '2026-07-01T10:00:00Z' }),
      pay({ id: '2', amount: 200, paid_at: '2026-07-05T10:00:00Z', status: 'voided', voided_at: '2026-07-06T10:00:00Z' }),
    ];
    expect(remainingForCollaborator({ totalPrice: 1000, legacyPaid: 0, payments })).toBe(700);
    expect(livePayments(payments)).toHaveLength(1);
  });

  it('counts legacy but never mutates it', () => {
    const input = { totalPrice: 500, legacyPaid: 500, payments: [] as CollaboratorPaymentRow[] };
    expect(remainingForCollaborator(input)).toBe(0);
    expect(input.legacyPaid).toBe(500);
    expect(paidFromPayments(input.payments)).toBe(0);
  });

  it('ignores soft-deleted payments', () => {
    const payments = [pay({ id: '1', amount: 100, paid_at: '2026-07-01T10:00:00Z', deleted_at: '2026-07-02T10:00:00Z' })];
    expect(remainingForCollaborator({ totalPrice: 400, legacyPaid: 0, payments })).toBe(400);
  });
});

describe('canPay', () => {
  it('rejects zero and negative amounts', () => {
    expect(canPay(0, 100).reason).toBe('invalid_amount');
    expect(canPay(-5, 100).reason).toBe('invalid_amount');
  });

  it('rejects a cent above the remaining amount', () => {
    expect(canPay(100.02, 100)).toEqual({ ok: false, reason: 'exceeds_remaining' });
    expect(canPay(100, 100).ok).toBe(true);
  });

  it('has no ceiling when the agreed amount is not entered', () => {
    expect(canPay(9999, null).ok).toBe(true);
  });
});

describe('groupPaymentsForDisplay', () => {
  const many = Array.from({ length: 8 }, (_, i) =>
    pay({
      id: `p${i}`,
      amount: 10 * (i + 1),
      paid_at: `2026-0${i < 4 ? 7 : 6}-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
    }),
  );

  it('shows the last five and folds the rest into months', () => {
    const g = groupPaymentsForDisplay(many);
    expect(g.recent).toHaveLength(5);
    expect(g.olderCount).toBe(3);
    expect(g.months.map((m) => m.key)).toEqual(['2026-06']);
    expect(g.months[0].payments).toHaveLength(3);
    expect(g.months[0].total).toBe(10 * 5 + 10 * 6 + 10 * 7);
  });

  it('keeps voided payments out of totals but visible in their own list', () => {
    const g = groupPaymentsForDisplay([
      pay({ id: 'a', amount: 100, paid_at: '2026-07-01T10:00:00Z' }),
      pay({ id: 'b', amount: 50, paid_at: '2026-07-02T10:00:00Z', status: 'voided', voided_at: '2026-07-03T10:00:00Z', void_reason: 'greška' }),
    ]);
    expect(g.total).toBe(100);
    expect(g.recent).toHaveLength(1);
    expect(g.voided).toHaveLength(1);
    expect(g.voided[0].void_reason).toBe('greška');
  });
});
