import { describe, it, expect } from 'vitest';
import {
  parseCollaboratorDeleteError,
  summarizeCollaboratorDeleteImpact,
} from '@/lib/collaboratorDeleteImpact';
import type { CollaboratorPaymentRow } from '@/lib/collaboratorPayment';

const row = (o: Partial<CollaboratorPaymentRow>): CollaboratorPaymentRow =>
  ({
    id: o.id ?? 'p',
    collaborator_id: o.collaborator_id ?? 'c1',
    project_id: 'pr1',
    amount: o.amount ?? 100,
    paid_at: o.paid_at ?? '2026-08-01T00:00:00Z',
    payment_source: 'cash',
    note: null,
    expense_id: null,
    status: o.status ?? 'paid',
    void_reason: null,
    voided_at: o.voided_at ?? null,
    deleted_at: o.deleted_at ?? null,
  }) as CollaboratorPaymentRow;

describe('summarizeCollaboratorDeleteImpact', () => {
  it('counts only live payments and reports voided separately', () => {
    const r = summarizeCollaboratorDeleteImpact(
      [
        row({ id: 'a', amount: 200 }),
        row({ id: 'b', amount: 250 }),
        row({ id: 'c', amount: 999, status: 'voided', voided_at: '2026-08-02T00:00:00Z' }),
        row({ id: 'd', collaborator_id: 'other', amount: 500 }),
      ],
      'c1',
    );
    expect(r.paymentCount).toBe(2);
    expect(r.paidTotal).toBe(450);
    expect(r.voidedCount).toBe(1);
    expect(r.blocked).toBe(true);
  });

  it('is not blocked when only voided payments remain', () => {
    const r = summarizeCollaboratorDeleteImpact(
      [row({ id: 'c', status: 'voided', voided_at: '2026-08-02T00:00:00Z' })],
      'c1',
    );
    expect(r.blocked).toBe(false);
    expect(r.voidedCount).toBe(1);
  });
});

describe('parseCollaboratorDeleteError', () => {
  it('reads count and sum out of the database signal', () => {
    const r = parseCollaboratorDeleteError({
      code: 'P0001',
      message: 'collaborator_has_live_payments|2|450.00',
    });
    expect(r.kind).toBe('has_live_payments');
    expect(r.paymentCount).toBe(2);
    expect(r.paidTotal).toBe(450);
  });

  it('maps ownership and missing collaborator', () => {
    expect(parseCollaboratorDeleteError({ code: '42501', message: 'not_project_owner' }).kind).toBe('not_owner');
    expect(parseCollaboratorDeleteError({ code: 'P0002', message: 'collaborator_not_found' }).kind).toBe('not_found');
  });

  it('never guesses on an unknown failure', () => {
    expect(parseCollaboratorDeleteError({ code: 'XX000', message: 'boom' }).kind).toBe('unknown');
  });
});
