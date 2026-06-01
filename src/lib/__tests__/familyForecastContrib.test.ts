import { describe, it, expect } from 'vitest';
import {
  computeFamilyOutflowsPerWeek,
  type SettlementForecastRow,
  type ForecastWeekRange,
} from '../familyForecastContrib';

const mkWeeks = (startIso: string, count: number): ForecastWeekRange[] => {
  const start = new Date(startIso);
  const out: ForecastWeekRange[] = [];
  for (let i = 0; i < count; i++) {
    const ws = new Date(start);
    ws.setDate(start.getDate() + i * 7);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    out.push({ start: ws, end: we });
  }
  return out;
};

describe('computeFamilyOutflowsPerWeek', () => {
  const me = 'user-a';
  const weeks = mkWeeks('2026-06-01', 8);

  it('returns zeros when no settlements', () => {
    expect(computeFamilyOutflowsPerWeek([], me, weeks)).toEqual(new Array(8).fill(0));
  });

  it('ignores settled and canceled', () => {
    const s: SettlementForecastRow[] = [
      { debtor_user_id: me, amount: 100, status: 'paid', period_end: '2026-06-10' },
      { debtor_user_id: me, amount: 100, status: 'canceled', period_end: '2026-06-10' },
    ];
    expect(computeFamilyOutflowsPerWeek(s, me, weeks).every((x) => x === 0)).toBe(true);
  });

  it('ignores settlements where user is not debtor', () => {
    const s: SettlementForecastRow[] = [
      { debtor_user_id: 'other', amount: 50, status: 'pending', period_end: '2026-06-10' },
    ];
    expect(computeFamilyOutflowsPerWeek(s, me, weeks).every((x) => x === 0)).toBe(true);
  });

  it('allocates pending into containing week', () => {
    const s: SettlementForecastRow[] = [
      { debtor_user_id: me, amount: 120, status: 'pending', period_end: '2026-06-10' },
    ];
    const out = computeFamilyOutflowsPerWeek(s, me, weeks);
    // 2026-06-10 falls in week index 1 (2026-06-08..2026-06-14)
    expect(out[1]).toBe(120);
    expect(out.reduce((a, b) => a + b, 0)).toBe(120);
  });

  it('catches up past-due into first week', () => {
    const s: SettlementForecastRow[] = [
      { debtor_user_id: me, amount: 80, status: 'pending', period_end: '2026-05-15' },
    ];
    const out = computeFamilyOutflowsPerWeek(s, me, weeks);
    expect(out[0]).toBe(80);
  });

  it('ignores beyond-horizon settlements', () => {
    const s: SettlementForecastRow[] = [
      { debtor_user_id: me, amount: 200, status: 'pending', period_end: '2027-01-01' },
    ];
    expect(computeFamilyOutflowsPerWeek(s, me, weeks).every((x) => x === 0)).toBe(true);
  });

  it('aggregates multiple in same week', () => {
    const s: SettlementForecastRow[] = [
      { debtor_user_id: me, amount: 30, status: 'pending', period_end: '2026-06-09' },
      { debtor_user_id: me, amount: 70, status: 'pending', period_end: '2026-06-12' },
    ];
    const out = computeFamilyOutflowsPerWeek(s, me, weeks);
    expect(out[1]).toBe(100);
  });

  it('returns zeros for empty userId', () => {
    const s: SettlementForecastRow[] = [
      { debtor_user_id: me, amount: 30, status: 'pending', period_end: '2026-06-09' },
    ];
    expect(computeFamilyOutflowsPerWeek(s, '', weeks)).toEqual(new Array(8).fill(0));
  });
});
