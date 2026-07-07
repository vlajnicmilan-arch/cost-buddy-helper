import { describe, it, expect } from 'vitest';
import {
  computePayoutPreview,
  derivePayoutStatus,
  computeRemainingForWorker,
  detectRateChangeWarning,
  derivePayoutPermissions,
  round2,
  type WorkEntryForPayout,
} from '../computePayoutPreview';

describe('round2', () => {
  it('rounds half up to 2 decimals like PG ROUND()', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
    expect(round2(0)).toBe(0);
  });
});

describe('computePayoutPreview', () => {
  const rate = 25;

  it('sums actual_hours of unlocked entries in period', () => {
    const entries: WorkEntryForPayout[] = [
      { work_date: '2026-06-01', actual_hours: 8, payout_id: null },
      { work_date: '2026-06-05', actual_hours: 4.5, payout_id: null },
      { work_date: '2026-06-15', actual_hours: 8, payout_id: null },
    ];
    const p = computePayoutPreview(entries, '2026-06-01', '2026-06-30', rate);
    expect(p.hoursCovered).toBe(20.5);
    expect(p.hourlyRate).toBe(25);
    expect(p.grossAmount).toBe(512.5);
    expect(p.eligibleEntryCount).toBe(3);
  });

  it('excludes locked entries (payout_id NOT NULL)', () => {
    const entries: WorkEntryForPayout[] = [
      { work_date: '2026-06-01', actual_hours: 8, payout_id: null },
      { work_date: '2026-06-05', actual_hours: 8, payout_id: 'prev-payout' },
    ];
    const p = computePayoutPreview(entries, '2026-06-01', '2026-06-30', rate);
    expect(p.hoursCovered).toBe(8);
    expect(p.eligibleEntryCount).toBe(1);
  });

  it('excludes entries outside period', () => {
    const entries: WorkEntryForPayout[] = [
      { work_date: '2026-05-31', actual_hours: 8, payout_id: null },
      { work_date: '2026-06-01', actual_hours: 8, payout_id: null },
      { work_date: '2026-07-01', actual_hours: 8, payout_id: null },
    ];
    const p = computePayoutPreview(entries, '2026-06-01', '2026-06-30', rate);
    expect(p.hoursCovered).toBe(8);
  });

  it('rounds gross to 2 decimals', () => {
    const entries: WorkEntryForPayout[] = [
      { work_date: '2026-06-01', actual_hours: 1.2, payout_id: null },
    ];
    // 1.2 * 25 = 30.00; stable case (JS float double vs PG numeric divergiraju
    // na true half-way vrijednostima kao 33.325 — SQL je source of truth,
    // UI je preview).
    const p = computePayoutPreview(entries, '2026-06-01', '2026-06-30', 25);
    expect(p.grossAmount).toBe(30);
  });

  it('returns zero gross for empty period', () => {
    const p = computePayoutPreview([], '2026-06-01', '2026-06-30', 25);
    expect(p.hoursCovered).toBe(0);
    expect(p.grossAmount).toBe(0);
    expect(p.eligibleEntryCount).toBe(0);
  });

  it('throws when periodEnd < periodStart', () => {
    expect(() =>
      computePayoutPreview([], '2026-06-30', '2026-06-01', 25),
    ).toThrow();
  });
});

describe('derivePayoutStatus', () => {
  it('advance when hours=0 and paid>0', () => {
    expect(derivePayoutStatus(0, 0, 500)).toBe('advance');
  });

  it('paid when paid >= gross', () => {
    expect(derivePayoutStatus(10, 250, 250)).toBe('paid');
    expect(derivePayoutStatus(10, 250, 300)).toBe('paid');
  });

  it('partial when paid < gross', () => {
    expect(derivePayoutStatus(10, 250, 100)).toBe('partial');
  });

  it('voided override wins', () => {
    expect(derivePayoutStatus(10, 250, 250, true)).toBe('voided');
  });

  it('paid=0 gross=0 → paid (nothing to pay)', () => {
    // Match SQL grana: paid (0) >= gross (0) → 'paid'. Nothing to isplatiti.
    expect(derivePayoutStatus(0, 0, 0)).toBe('paid');
  });

  it('throws on negative paid', () => {
    expect(() => derivePayoutStatus(10, 250, -1)).toThrow();
  });
});

describe('computeRemainingForWorker', () => {
  it('sums gross and paid across non-voided payouts', () => {
    const r = computeRemainingForWorker([
      { gross_amount: 500, paid_amount: 500, status: 'paid' },
      { gross_amount: 300, paid_amount: 150, status: 'partial' },
    ]);
    expect(r.totalGross).toBe(800);
    expect(r.totalPaid).toBe(650);
    expect(r.remaining).toBe(150);
  });

  it('excludes voided payouts from both sides', () => {
    const r = computeRemainingForWorker([
      { gross_amount: 500, paid_amount: 500, status: 'paid' },
      { gross_amount: 500, paid_amount: 500, status: 'voided' },
    ]);
    expect(r.totalGross).toBe(500);
    expect(r.totalPaid).toBe(500);
    expect(r.remaining).toBe(0);
  });

  it('advance payouts count in paid only (no planned gross)', () => {
    const r = computeRemainingForWorker([
      { gross_amount: 0, paid_amount: 200, status: 'advance' },
    ]);
    expect(r.totalGross).toBe(0);
    expect(r.totalPaid).toBe(200);
    expect(r.remaining).toBe(-200);
  });

  it('empty list → zero everywhere', () => {
    const r = computeRemainingForWorker([]);
    expect(r).toEqual({ totalGross: 0, totalPaid: 0, remaining: 0 });
  });
});

describe('detectRateChangeWarning', () => {
  it('flags rate change when overlapping payout has different snapshot', () => {
    const r = detectRateChangeWarning(30, '2026-07-01', '2026-07-31', [
      {
        period_start: '2026-06-15',
        period_end: '2026-07-15',
        hourly_rate_snapshot: 25,
        status: 'paid',
      },
    ]);
    expect(r.changed).toBe(true);
    expect(r.previousRate).toBe(25);
  });

  it('no warning when snapshot matches', () => {
    const r = detectRateChangeWarning(25, '2026-07-01', '2026-07-31', [
      {
        period_start: '2026-06-01',
        period_end: '2026-06-30',
        hourly_rate_snapshot: 25,
        status: 'paid',
      },
    ]);
    // Not overlapping → no prior found → no warning
    expect(r.changed).toBe(false);
    expect(r.previousRate).toBe(null);
  });

  it('ignores voided prior payouts', () => {
    const r = detectRateChangeWarning(30, '2026-07-01', '2026-07-31', [
      {
        period_start: '2026-06-15',
        period_end: '2026-07-15',
        hourly_rate_snapshot: 25,
        status: 'voided',
      },
    ]);
    expect(r.changed).toBe(false);
  });

  it('no prior payouts → no warning', () => {
    const r = detectRateChangeWarning(30, '2026-07-01', '2026-07-31', []);
    expect(r.changed).toBe(false);
    expect(r.previousRate).toBe(null);
  });
});

describe('derivePayoutPermissions', () => {
  it('owner not readonly → all writes allowed', () => {
    const p = derivePayoutPermissions({ isProjectOwner: true, isReadOnly: false });
    expect(p.canCreatePayout).toBe(true);
    expect(p.canVoidPayout).toBe(true);
    expect(p.canUnlockEntry).toBe(true);
    expect(p.canUpdateLockedEntry).toBe(true);
    expect(p.canViewOwnPayouts).toBe(true);
  });

  it('owner but readonly (billing downgrade) → writes blocked', () => {
    const p = derivePayoutPermissions({ isProjectOwner: true, isReadOnly: true });
    expect(p.canCreatePayout).toBe(false);
    expect(p.canVoidPayout).toBe(false);
    expect(p.canUnlockEntry).toBe(false);
    expect(p.canUpdateLockedEntry).toBe(false);
    expect(p.canViewOwnPayouts).toBe(true);
  });

  it('non-owner → writes blocked, view allowed', () => {
    const p = derivePayoutPermissions({ isProjectOwner: false, isReadOnly: false });
    expect(p.canCreatePayout).toBe(false);
    expect(p.canVoidPayout).toBe(false);
    expect(p.canUnlockEntry).toBe(false);
    expect(p.canUpdateLockedEntry).toBe(false);
    expect(p.canViewOwnPayouts).toBe(true);
  });
});
