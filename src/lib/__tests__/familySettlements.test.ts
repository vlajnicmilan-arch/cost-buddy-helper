import { describe, it, expect } from 'vitest';
import { computeSettlements, buildHub3DeepLink, type MemberPosition } from '../familySettlements';

describe('computeSettlements', () => {
  it('returns no settlement when everyone is square', () => {
    const positions: MemberPosition[] = [
      { userId: 'a', owed: 100, paid: 100 },
      { userId: 'b', owed: 50, paid: 50 },
    ];
    expect(computeSettlements(positions)).toEqual([]);
  });

  it('single debtor owes single creditor', () => {
    const positions: MemberPosition[] = [
      { userId: 'a', owed: 100, paid: 150 }, // creditor +50
      { userId: 'b', owed: 100, paid: 50 },  // debtor   -50
    ];
    const out = computeSettlements(positions);
    expect(out).toEqual([{ debtorUserId: 'b', creditorUserId: 'a', amount: 50 }]);
  });

  it('greedy netting with 3 members: 1 creditor, 2 debtors', () => {
    const positions: MemberPosition[] = [
      { userId: 'a', owed: 100, paid: 300 }, // +200 creditor
      { userId: 'b', owed: 100, paid: 0 },   // -100 debtor
      { userId: 'c', owed: 100, paid: 0 },   // -100 debtor
    ];
    const out = computeSettlements(positions);
    // both b and c owe a 100 each, biggest debtor paired with biggest creditor
    expect(out).toHaveLength(2);
    expect(out.every(s => s.creditorUserId === 'a')).toBe(true);
    expect(out.map(s => s.amount).sort()).toEqual([100, 100]);
  });

  it('greedy netting with 2 creditors, 1 debtor', () => {
    const positions: MemberPosition[] = [
      { userId: 'a', owed: 100, paid: 150 }, // +50
      { userId: 'b', owed: 100, paid: 200 }, // +100
      { userId: 'c', owed: 100, paid: -50 }, // -150 (paid less than owed by 150)
    ];
    const out = computeSettlements(positions);
    expect(out).toHaveLength(2);
    expect(out.every(s => s.debtorUserId === 'c')).toBe(true);
    const sum = out.reduce((s, x) => s + x.amount, 0);
    expect(sum).toBeCloseTo(150, 2);
  });

  it('produces at most N-1 settlements for N members', () => {
    const positions: MemberPosition[] = Array.from({ length: 5 }, (_, i) => ({
      userId: `u${i}`,
      owed: 100,
      paid: i === 0 ? 500 : 0,
    }));
    const out = computeSettlements(positions);
    expect(out.length).toBeLessThanOrEqual(4);
    expect(out.every(s => s.creditorUserId === 'u0')).toBe(true);
  });

  it('ignores sub-cent residuals', () => {
    const positions: MemberPosition[] = [
      { userId: 'a', owed: 100.001, paid: 100 },
      { userId: 'b', owed: 100, paid: 100.001 },
    ];
    expect(computeSettlements(positions)).toEqual([]);
  });
});

describe('buildHub3DeepLink', () => {
  it('produces a hub3:// URI', () => {
    const link = buildHub3DeepLink({
      amount: 12.5,
      creditorName: 'Ana Anić',
      creditorIban: 'HR1723600001101234567',
      description: 'Obračun siječanj',
    });
    expect(link.startsWith('hub3://?payload=')).toBe(true);
    const payload = decodeURIComponent(link.replace('hub3://?payload=', ''));
    expect(payload).toContain('HRVHUB30');
    expect(payload).toContain('EUR');
    expect(payload).toContain('HR1723600001101234567');
    expect(payload).toContain('Ana Anić');
    expect(payload).toContain('Obračun siječanj');
    // 12.5 EUR → 1250 cents, padded to 15 digits
    expect(payload).toContain('000000000001250');
  });

  it('strips spaces from IBAN', () => {
    const link = buildHub3DeepLink({
      amount: 1,
      creditorName: 'X',
      creditorIban: 'HR12 3600 0001 1012 3456 7',
    });
    expect(decodeURIComponent(link)).toContain('HR1236000001101234567');
  });

  it('truncates description to 35 chars', () => {
    const desc = 'z'.repeat(100);
    const link = buildHub3DeepLink({
      amount: 1, creditorName: 'X', creditorIban: 'HR1', description: desc,
    });
    const payload = decodeURIComponent(link.replace('hub3://?payload=', ''));
    const zRun = payload.match(/z+/)![0];
    expect(zRun.length).toBe(35);
  });
});
