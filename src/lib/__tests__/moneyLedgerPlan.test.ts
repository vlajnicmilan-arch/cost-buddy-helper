import { describe, it, expect } from 'vitest';
import {
  planLedgerRow,
  planLedgerRows,
  LedgerPlanOwnerError,
  type LedgerRowInput,
} from '../moneyLedgerPlan';

const base = (over: Partial<LedgerRowInput> = {}): LedgerRowInput => ({
  rowIndex: 0,
  userId: 'user-1',
  amount: 100,
  dateIso: '2026-09-01T10:00:00.000Z',
  direction: 'out',
  walletId: 'w1',
  fingerprint: 'fp-0',
  classification: { kind: 'new', existsByFingerprint: false, deletedByFingerprint: false },
  candidates: [],
  userChoice: {},
  ...over,
});

describe('planLedgerRow — vlasništvo', () => {
  it('bez userId baca grešku', () => {
    expect(() => planLedgerRow(base({ userId: '' }))).toThrow(LedgerPlanOwnerError);
  });

  it('nikad ne vraća kandidata drugog vlasnika (odabrani par)', () => {
    const d = planLedgerRow(base({
      classification: { kind: 'transfer', pairedExistingId: null },
      candidates: [{ id: 'p-tudji', userId: 'user-2', kind: 'pair' }],
      userChoice: { pairChoiceId: 'p-tudji' },
    }));
    expect(d.outcome).not.toBe('pair');
    expect(d.candidateId).toBeNull();
  });

  it('nikad ne vraća tuđi automatski par', () => {
    const d = planLedgerRow(base({
      classification: { kind: 'transfer', pairedExistingId: 'p-tudji' },
      candidates: [{ id: 'p-tudji', userId: 'user-2', kind: 'pair' }],
    }));
    expect(d.outcome).toBe('needs_review');
    expect(d.candidateId).toBeNull();
  });

  it('nikad ne spaja s tuđim ručnim unosom', () => {
    const d = planLedgerRow(base({
      classification: { kind: 'auto_merge', manualId: 'm-tudji' },
      candidates: [{ id: 'm-tudji', userId: 'user-2', kind: 'manual' }],
      userChoice: { autoMergeOn: true },
    }));
    expect(d.outcome).toBe('needs_review');
    expect(d.candidateId).toBeNull();
  });
});

describe('planLedgerRow — ishodi', () => {
  it('otisak živog retka', () => {
    const d = planLedgerRow(base({
      classification: { kind: 'new', existsByFingerprint: true, deletedByFingerprint: false },
      userChoice: { newRowOn: true },
    }));
    expect(d).toMatchObject({ outcome: 'needs_review', reason: 'fingerprint_live' });
  });

  it('vraćanje ranije obrisanog retka', () => {
    const d = planLedgerRow(base({
      classification: { kind: 'new', existsByFingerprint: false, deletedByFingerprint: true },
      userChoice: { restoreDeleted: true },
    }));
    expect(d).toMatchObject({ outcome: 'restore', reason: 'restore_confirmed' });
  });

  it('potvrđeni prijenos', () => {
    const d = planLedgerRow(base({
      classification: { kind: 'transfer', pairedExistingId: null },
      userChoice: { transferEnabled: true },
    }));
    expect(d).toMatchObject({ outcome: 'transfer', reason: 'transfer_confirmed' });
  });

  it('poništeni prijenos postaje običan redak', () => {
    const d = planLedgerRow(base({
      classification: { kind: 'transfer', pairedExistingId: null },
      userChoice: { transferEnabled: false },
    }));
    expect(d).toMatchObject({ outcome: 'new', reason: 'transfer_rejected' });
  });
});

describe('planLedgerRows', () => {
  it('čuva redoslijed redaka', () => {
    const rows = [3, 1, 2].map((i) => base({ rowIndex: i, userChoice: { newRowOn: true } }));
    expect(planLedgerRows(rows).map((d) => d.rowIndex)).toEqual([3, 1, 2]);
  });
});
