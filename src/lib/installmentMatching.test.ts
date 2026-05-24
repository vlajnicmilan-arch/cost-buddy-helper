import { describe, it, expect } from 'vitest';
import { matchInstallmentToPlan, normalizeDesc, type InstallmentPlanLike } from './installmentMatching';

const plan: InstallmentPlanLike = {
  id: 'plan-1',
  description: 'EMMEZETA d.o.o.',
  total_amount: 674.38,
  installment_count: 7,
  type: 'expense',
  installments: [
    { id: 'i1', plan_id: 'plan-1', installment_number: 1, amount: 96.34, status: 'paid' },
    { id: 'i2', plan_id: 'plan-1', installment_number: 2, amount: 96.34, status: 'paid' },
    { id: 'i3', plan_id: 'plan-1', installment_number: 3, amount: 96.34, status: 'paid' },
    { id: 'i4', plan_id: 'plan-1', installment_number: 4, amount: 96.34, status: 'paid' },
    { id: 'i5', plan_id: 'plan-1', installment_number: 5, amount: 96.34, status: 'paid' },
    { id: 'i6', plan_id: 'plan-1', installment_number: 6, amount: 96.34, status: 'planned' },
    { id: 'i7', plan_id: 'plan-1', installment_number: 7, amount: 96.34, status: 'planned' },
  ],
};

describe('normalizeDesc', () => {
  it('strips (n/m) notaciju i diakritike', () => {
    expect(normalizeDesc('EMMEZETA d.o.o. (6/7)')).toBe('emmezeta d o o');
    expect(normalizeDesc('Pošta — Pandora')).toBe('posta pandora');
  });
});

describe('matchInstallmentToPlan', () => {
  it('matcha rata 6/7 na otvoreni installment #6', () => {
    const m = matchInstallmentToPlan({
      base_description: 'EMMEZETA d.o.o.',
      description: 'EMMEZETA d.o.o. (6/7)',
      amount: 96.34,
      installment_current: 6,
      installment_total: 7,
      type: 'expense',
    }, [plan]);
    expect(m).not.toBeNull();
    expect(m!.installment.installment_number).toBe(6);
    expect(m!.plan.id).toBe('plan-1');
  });

  it('odbacuje plan kad se total broj rata ne poklapa', () => {
    const m = matchInstallmentToPlan({
      base_description: 'EMMEZETA',
      description: 'EMMEZETA (3/12)',
      amount: 96.34,
      installment_current: 3,
      installment_total: 12,
      type: 'expense',
    }, [plan]);
    expect(m).toBeNull();
  });

  it('odbacuje kad je iznos rate izvan 0.1% tolerancije', () => {
    const m = matchInstallmentToPlan({
      base_description: 'EMMEZETA',
      description: 'EMMEZETA (6/7)',
      amount: 50.00,
      installment_current: 6,
      installment_total: 7,
      type: 'expense',
    }, [plan]);
    expect(m).toBeNull();
  });

  it('padne na prvi otvoreni installment ako PDF ne daje current', () => {
    const m = matchInstallmentToPlan({
      base_description: 'EMMEZETA d o o',
      description: 'EMMEZETA',
      amount: 96.34,
      installment_current: null,
      installment_total: null,
      type: 'expense',
    }, [plan]);
    expect(m).not.toBeNull();
    expect(m!.installment.installment_number).toBe(6);
  });

  it('vraća null kad nema otvorenih rata', () => {
    const closed: InstallmentPlanLike = {
      ...plan,
      installments: plan.installments!.map(i => ({ ...i, status: 'paid' as const })),
    };
    const m = matchInstallmentToPlan({
      base_description: 'EMMEZETA',
      description: 'EMMEZETA (6/7)',
      amount: 96.34,
      installment_current: 6,
      installment_total: 7,
      type: 'expense',
    }, [closed]);
    expect(m).toBeNull();
  });
});
