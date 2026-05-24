import { describe, it, expect } from 'vitest';
import { isMergeablePair, canMergeSelection, type MergeCandidateExpense } from '../manualBankMergePair';

const baseManual: MergeCandidateExpense = {
  id: 'm1',
  user_id: 'u1',
  type: 'expense',
  amount: 40,
  date: '2026-05-01',
  payment_source: 'custom:abc',
  currency: 'EUR',
  expense_nature: 'regular',
  bank_transaction_id: null,
  bank_match_status: 'manual',
  is_advance: false,
  linked_advance_ids: null,
  deleted_at: null,
};

const baseBank: MergeCandidateExpense = {
  ...baseManual,
  id: 'b1',
  bank_transaction_id: 'bt-1',
  bank_match_status: 'bank_only',
  date: '2026-05-03',
};

describe('isMergeablePair', () => {
  it('merges happy path (one manual + one bank, all match)', () => {
    const r = isMergeablePair(baseManual, baseBank);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.manual.id).toBe('m1');
      expect(r.bank.id).toBe('b1');
    }
  });

  it('rejects when both manual', () => {
    const r = isMergeablePair(baseManual, { ...baseManual, id: 'm2' });
    expect(r).toEqual({ ok: false, reason: 'transactions.merge.errors.bothManual' });
  });

  it('rejects when both bank', () => {
    const r = isMergeablePair(baseBank, { ...baseBank, id: 'b2' });
    expect(r).toEqual({ ok: false, reason: 'transactions.merge.errors.bothBank' });
  });

  it('rejects different type', () => {
    const r = isMergeablePair(baseManual, { ...baseBank, type: 'income' });
    expect(r).toEqual({ ok: false, reason: 'transactions.merge.errors.differentType' });
  });

  it('rejects transfer', () => {
    const r = isMergeablePair({ ...baseManual, type: 'transfer' }, { ...baseBank, type: 'transfer' });
    expect(r).toEqual({ ok: false, reason: 'transactions.merge.errors.transferNature' });
  });

  it('rejects correction nature', () => {
    const r = isMergeablePair({ ...baseManual, expense_nature: 'correction' }, baseBank);
    expect(r).toEqual({ ok: false, reason: 'transactions.merge.errors.correctionNature' });
  });

  it('rejects different payment_source', () => {
    const r = isMergeablePair(baseManual, { ...baseBank, payment_source: 'custom:xyz' });
    expect(r).toEqual({ ok: false, reason: 'transactions.merge.errors.differentSource' });
  });

  it('rejects different currency', () => {
    const r = isMergeablePair(baseManual, { ...baseBank, currency: 'USD' });
    expect(r).toEqual({ ok: false, reason: 'transactions.merge.errors.differentCurrency' });
  });

  it('rejects amount outside 0.1% tolerance', () => {
    const r = isMergeablePair(baseManual, { ...baseBank, amount: 41 });
    expect(r).toEqual({ ok: false, reason: 'transactions.merge.errors.differentAmount' });
  });

  it('accepts amount within 0.1% tolerance', () => {
    const r = isMergeablePair({ ...baseManual, amount: 1000 }, { ...baseBank, amount: 1000.5 });
    expect(r.ok).toBe(true);
  });

  it('rejects date >3 days apart', () => {
    const r = isMergeablePair(baseManual, { ...baseBank, date: '2026-05-10' });
    expect(r).toEqual({ ok: false, reason: 'transactions.merge.errors.dateTooFar' });
  });

  it('accepts date exactly 3 days apart', () => {
    const r = isMergeablePair({ ...baseManual, date: '2026-05-01' }, { ...baseBank, date: '2026-05-04' });
    expect(r.ok).toBe(true);
  });

  it('rejects already-confirmed manual', () => {
    const r = isMergeablePair({ ...baseManual, bank_match_status: 'confirmed' }, baseBank);
    expect(r).toEqual({ ok: false, reason: 'transactions.merge.errors.alreadyConfirmed' });
  });

  it('rejects advance-linked rows', () => {
    const r = isMergeablePair({ ...baseManual, is_advance: true }, baseBank);
    expect(r).toEqual({ ok: false, reason: 'transactions.merge.errors.advanceProtected' });
  });

  it('rejects soft-deleted rows', () => {
    const r = isMergeablePair({ ...baseManual, deleted_at: '2026-01-01' }, baseBank);
    expect(r).toEqual({ ok: false, reason: 'transactions.merge.errors.deleted' });
  });

  it('rejects different users', () => {
    const r = isMergeablePair(baseManual, { ...baseBank, user_id: 'u2' });
    expect(r).toEqual({ ok: false, reason: 'transactions.merge.errors.differentUser' });
  });
});

describe('canMergeSelection', () => {
  it('rejects empty selection', () => {
    expect(canMergeSelection([])).toEqual({ ok: false, reason: 'transactions.merge.errors.notTwoSelected' });
  });
  it('rejects single selection', () => {
    expect(canMergeSelection([baseManual])).toEqual({ ok: false, reason: 'transactions.merge.errors.notTwoSelected' });
  });
  it('rejects 3 selected', () => {
    expect(canMergeSelection([baseManual, baseBank, baseManual])).toEqual({
      ok: false,
      reason: 'transactions.merge.errors.notTwoSelected',
    });
  });
  it('accepts valid pair', () => {
    expect(canMergeSelection([baseManual, baseBank]).ok).toBe(true);
  });
});
