import { describe, it, expect } from 'vitest';
import { buildMoveSummary } from '@/lib/projectMoveSummary';

const sources = [
  { id: 'aaa', name: 'Keš', business_profile_id: null },
  { id: 'bbb', name: 'Akrobat račun', business_profile_id: 'biz-1' },
];

describe('buildMoveSummary', () => {
  it('zbraja troškove po novčaniku', () => {
    const s = buildMoveSummary(
      [
        { amount: 10, payment_source: 'custom:aaa' },
        { amount: 15, payment_source: 'custom:aaa' },
        { amount: 100, payment_source: 'custom:bbb' },
      ],
      sources,
      'biz-1',
    );
    expect(s.count).toBe(3);
    expect(s.total).toBe(125);
    expect(s.lines[0]).toMatchObject({ name: 'Akrobat račun', count: 1, total: 100, isCrossScope: false });
    expect(s.lines[1]).toMatchObject({ name: 'Keš', count: 2, total: 25, isCrossScope: true, scope: 'personal' });
    expect(s.hasCrossScope).toBe(true);
  });

  it('povratak u osobno: poslovni novčanik je iz druge strane', () => {
    const s = buildMoveSummary([{ amount: 50, payment_source: 'custom:bbb' }], sources, null);
    expect(s.lines[0]).toMatchObject({ isCrossScope: true, scope: 'business' });
  });

  it('korekcije i obrisani se ne broje', () => {
    const s = buildMoveSummary(
      [
        { amount: 10, payment_source: 'custom:aaa', expense_nature: 'correction' },
        { amount: 20, payment_source: 'custom:aaa', deleted_at: '2026-01-01' },
        { amount: 5, payment_source: 'custom:aaa' },
      ],
      sources,
      null,
    );
    expect(s.count).toBe(1);
    expect(s.total).toBe(5);
  });

  it('nepoznat/ugrađeni izvor dobije rezervni naziv', () => {
    const s = buildMoveSummary([{ amount: 7, payment_source: null }], sources, null);
    expect(s.lines[0].name).toBe('Gotovina');
  });
});
