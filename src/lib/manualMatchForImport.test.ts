import { describe, it, expect } from 'vitest';
import { matchManualToImported } from './manualMatchForImport';

const SRC_A = 'custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SRC_B = 'custom:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const day = (s: string) => new Date(`${s}T12:00:00.000Z`);

describe('matchManualToImported', () => {
  it('same-day exact match → 1:1 merge', () => {
    const out = matchManualToImported({
      imported: [{ index: 0, paymentSource: SRC_A, type: 'expense', amount: 12.5, date: day('2026-05-10') }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC_A, type: 'expense', amount: 12.5, date: day('2026-05-10') }],
    });
    expect(out.matches).toEqual([{ importedIndex: 0, manualId: 'm1' }]);
    expect(out.ambiguous).toEqual([]);
    expect(out.unmatched).toEqual([]);
  });

  it('±1 day boundary (manual = imported − 1) merges', () => {
    const out = matchManualToImported({
      imported: [{ index: 0, paymentSource: SRC_A, type: 'expense', amount: 30, date: day('2026-05-10') }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC_A, type: 'expense', amount: 30, date: day('2026-05-09') }],
    });
    expect(out.matches).toHaveLength(1);
  });

  it('±1 day boundary (manual = imported + 1) merges', () => {
    const out = matchManualToImported({
      imported: [{ index: 0, paymentSource: SRC_A, type: 'expense', amount: 30, date: day('2026-05-10') }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC_A, type: 'expense', amount: 30, date: day('2026-05-11') }],
    });
    expect(out.matches).toHaveLength(1);
  });

  it('2 day difference → no match (unmatched)', () => {
    const out = matchManualToImported({
      imported: [{ index: 0, paymentSource: SRC_A, type: 'expense', amount: 30, date: day('2026-05-10') }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC_A, type: 'expense', amount: 30, date: day('2026-05-12') }],
    });
    expect(out.matches).toEqual([]);
    expect(out.unmatched).toEqual([0]);
  });

  it('2 candidates within window → ambiguous, NOT merged', () => {
    const out = matchManualToImported({
      imported: [{ index: 0, paymentSource: SRC_A, type: 'expense', amount: 5, date: day('2026-05-10') }],
      manualCandidates: [
        { id: 'm1', paymentSource: SRC_A, type: 'expense', amount: 5, date: day('2026-05-10') },
        { id: 'm2', paymentSource: SRC_A, type: 'expense', amount: 5, date: day('2026-05-11') },
      ],
    });
    expect(out.matches).toEqual([]);
    expect(out.ambiguous).toEqual([0]);
    expect(out.unmatched).toEqual([]);
  });

  it('transfer rows are always unmatched (never auto-merged)', () => {
    const out = matchManualToImported({
      imported: [{ index: 0, paymentSource: SRC_A, type: 'transfer', amount: 100, date: day('2026-05-10') }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC_A, type: 'transfer', amount: 100, date: day('2026-05-10') }],
    });
    expect(out.matches).toEqual([]);
    expect(out.unmatched).toEqual([0]);
  });

  it('different payment_source → no match', () => {
    const out = matchManualToImported({
      imported: [{ index: 0, paymentSource: SRC_A, type: 'expense', amount: 30, date: day('2026-05-10') }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC_B, type: 'expense', amount: 30, date: day('2026-05-10') }],
    });
    expect(out.matches).toEqual([]);
    expect(out.unmatched).toEqual([0]);
  });

  it('different type (income vs expense) → no match', () => {
    const out = matchManualToImported({
      imported: [{ index: 0, paymentSource: SRC_A, type: 'expense', amount: 30, date: day('2026-05-10') }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC_A, type: 'income', amount: 30, date: day('2026-05-10') }],
    });
    expect(out.matches).toEqual([]);
    expect(out.unmatched).toEqual([0]);
  });

  it('different amount (>0.01) → no match', () => {
    const out = matchManualToImported({
      imported: [{ index: 0, paymentSource: SRC_A, type: 'expense', amount: 30, date: day('2026-05-10') }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC_A, type: 'expense', amount: 30.02, date: day('2026-05-10') }],
    });
    expect(out.matches).toEqual([]);
    expect(out.unmatched).toEqual([0]);
  });

  it('manual candidate consumed once: two imports, one candidate → second imported unmatched', () => {
    const out = matchManualToImported({
      imported: [
        { index: 0, paymentSource: SRC_A, type: 'expense', amount: 30, date: day('2026-05-10') },
        { index: 1, paymentSource: SRC_A, type: 'expense', amount: 30, date: day('2026-05-10') },
      ],
      manualCandidates: [{ id: 'm1', paymentSource: SRC_A, type: 'expense', amount: 30, date: day('2026-05-10') }],
    });
    expect(out.matches).toEqual([{ importedIndex: 0, manualId: 'm1' }]);
    expect(out.unmatched).toEqual([1]);
  });

  it('null vs null payment_source counts as same source', () => {
    const out = matchManualToImported({
      imported: [{ index: 0, paymentSource: null, type: 'expense', amount: 10, date: day('2026-05-10') }],
      manualCandidates: [{ id: 'm1', paymentSource: null, type: 'expense', amount: 10, date: day('2026-05-10') }],
    });
    expect(out.matches).toHaveLength(1);
  });

  it('income rows can also be merged', () => {
    const out = matchManualToImported({
      imported: [{ index: 0, paymentSource: SRC_A, type: 'income', amount: 1500, date: day('2026-05-10') }],
      manualCandidates: [{ id: 'm1', paymentSource: SRC_A, type: 'income', amount: 1500, date: day('2026-05-09') }],
    });
    expect(out.matches).toHaveLength(1);
  });
});
