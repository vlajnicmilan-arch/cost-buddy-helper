/**
 * PAR PRIJE SVEGA — redak uparen s postojećim prijenosom ne smije stvoriti
 * novi zapis; „ovo je drugi prijenos" vraća ga u redovni put.
 * Uz to: upareni redak ne ulazi u prag popunjavanja po obrascu.
 */
import { describe, it, expect } from 'vitest';
import { planExecution } from '../executor';
import { selectPatternInputs } from '../patternSelection';
import type { ImportReviewDecisions, ImportReviewPayload, SerializedImportedTx } from '../types';

const tx = (i: number, over: Partial<SerializedImportedTx> = {}): SerializedImportedTx => ({
  index: i,
  dateIso: '2026-08-11T00:00:00.000Z',
  amount: 50,
  type: 'transfer',
  category: 'Ostalo',
  description: 'Uplata na Aircash Google Pay',
  merchantName: null,
  paymentSource: 'custom:revolut',
  balanceAfter: null,
  bankRowSeq: i,
  fingerprint: `fp-${i}`,
  ...over,
});

const payload = (rows: ImportReviewPayload['rows'], txs: SerializedImportedTx[]): ImportReviewPayload => ({
  jobId: 'job-1',
  sourceId: 'revolut',
  sourceName: 'Revolut',
  createdAt: 0,
  batchId: 'batch-1',
  availableTargets: [],
  manualCandidates: {},
  rows,
  importedTransactions: txs,
});

const pairedRow = (index: number) => ({
  index,
  date: '2026-08-11',
  amount: 50,
  type: 'transfer' as const,
  description: 'Uplata na Aircash Google Pay',
  merchantName: null,
  classification: {
    kind: 'transfer' as const,
    targetIncomeSourceId: 'aircash',
    ruleId: null,
    direction: 'out' as const,
    origin: 'counterpart' as const,
    pairedExistingId: 'existing-1',
    pairedPayerWalletId: 'revolut',
    pairedReceiverWalletId: 'aircash',
    pairedExistingDate: '2026-08-11',
    pairedExistingAmount: 50,
  },
});

const decisions = (over: Partial<ImportReviewDecisions> = {}): ImportReviewDecisions => ({
  autoMerge: {},
  questions: {},
  newRows: {},
  transfers: {},
  needsExplanation: {},
  restoreDeleted: {},
  ...over,
});

describe('uparivanje dviju strana prijenosa — plan', () => {
  it('(a) upareni redak ide u pairs, ne u transfers ni inserts', () => {
    const plan = planExecution(payload([pairedRow(0)] as any, [tx(0)]), decisions());
    expect(plan.pairs).toHaveLength(1);
    expect(plan.pairs[0].existingId).toBe('existing-1');
    expect(plan.transfers).toHaveLength(0);
    expect(plan.inserts).toHaveLength(0);
  });

  it('(b) „ovo je drugi prijenos" poništava par', () => {
    const plan = planExecution(
      payload([pairedRow(0)] as any, [tx(0)]),
      decisions({ unpair: { 0: true } }),
    );
    expect(plan.pairs).toHaveLength(0);
  });

  it('(c) ispravak platitelja prenosi se u plan', () => {
    const row = pairedRow(0);
    (row.classification as any).pairedCorrectedPayerFrom = 'kes';
    (row.classification as any).counterpartSignal = 'card';
    const plan = planExecution(payload([row] as any, [tx(0)]), decisions());
    expect(plan.pairs[0].correctedPayerFrom).toBe('kes');
    expect(plan.pairs[0].payerWalletId).toBe('revolut');
    expect(plan.pairs[0].signal).toBe('card');
  });

  it('(d) upareni redak ne ulazi u obrazac', () => {
    const { manual, candidates } = selectPatternInputs({
      rows: [{
        index: 0,
        type: 'transfer',
        merchantName: null,
        description: 'Uplata na Aircash Google Pay',
        classificationKind: 'transfer',
        classificationTargetIncomeSourceId: '',
        pairedExistingId: 'existing-1',
        paymentSource: 'custom:revolut',
        txType: 'transfer',
        statementDirection: 'out',
        amount: -50,
      }],
      transfers: {},
    });
    expect(manual).toHaveLength(0);
    expect(candidates).toHaveLength(0);
  });
});
