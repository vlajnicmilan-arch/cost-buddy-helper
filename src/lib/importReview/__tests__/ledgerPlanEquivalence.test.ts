/**
 * BRANA PRESELJENJA ODLUKE (Korak 3, nalog 1).
 *
 * `legacyPlanExecution` je DOSLOVNA kopija odluke kakva je bila prije
 * preseljenja u zajedničku jezgru. Test vozi isti ulaz kroz staru i novu
 * verziju i traži istu odluku, istog kandidata i isti redoslijed (rowIndex).
 */
import { describe, it, expect } from 'vitest';
import { planExecution } from '../executor';
import type {
  ImportReviewDecisions,
  ImportReviewPayload,
  SerializedImportedTx,
} from '../types';

// ---------------- STARA ODLUKA (verbatim, prije jezgre) ----------------

function legacyPlanExecution(payload: ImportReviewPayload, decisions: ImportReviewDecisions) {
  const txByIndex = new Map<number, SerializedImportedTx>();
  for (const tx of payload.importedTransactions) txByIndex.set(tx.index, tx);

  const merges: any[] = [];
  const inserts: any[] = [];
  const transfers: any[] = [];
  const restores: any[] = [];
  const pairs: any[] = [];
  let skippedByUser = 0;
  let skippedFingerprint = 0;
  let skippedPreviouslyDeleted = 0;

  for (const row of payload.rows) {
    const tx = txByIndex.get(row.index);
    if (!tx) continue;

    const cls: any = row.classification;
    const statementWalletId =
      typeof tx.paymentSource === 'string' && tx.paymentSource.startsWith('custom:')
        ? tx.paymentSource.slice('custom:'.length).toLowerCase()
        : null;
    const counterpartOf = (payer?: string | null, receiver?: string | null): string | null => {
      if (payer && payer !== statementWalletId) return payer;
      if (receiver && receiver !== statementWalletId) return receiver;
      return null;
    };
    const directionOfPair = (payer?: string | null): 'in' | 'out' | null => {
      if (!statementWalletId || !payer) return null;
      return payer === statementWalletId ? 'out' : 'in';
    };

    const choice = decisions.pairChoice?.[row.index];
    if (cls.kind === 'transfer' && typeof choice === 'string' && choice.length > 0 && choice !== 'none') {
      const picked = (cls.pairCandidates ?? []).find((c: any) => c.id === choice);
      if (picked) {
        pairs.push({
          rowIndex: row.index,
          tx,
          existingId: picked.id,
          payerWalletId: picked.payerWalletId ?? null,
          correctedPayerFrom: null,
          signal: null,
          convert: picked.convert === true,
          counterpartSourceId: counterpartOf(picked.payerWalletId, picked.receiverWalletId),
          direction: directionOfPair(picked.payerWalletId),
        });
        continue;
      }
    }

    if (
      cls.kind === 'transfer' &&
      typeof cls.pairedExistingId === 'string' &&
      cls.pairedExistingId.length > 0 &&
      decisions.unpair?.[row.index] !== true
    ) {
      pairs.push({
        rowIndex: row.index,
        tx,
        existingId: cls.pairedExistingId,
        payerWalletId: cls.pairedPayerWalletId ?? null,
        correctedPayerFrom: cls.pairedCorrectedPayerFrom ?? null,
        signal: cls.counterpartSignal ?? null,
        convert: cls.pairedConvert === true,
        counterpartSourceId: counterpartOf(cls.pairedPayerWalletId, cls.pairedReceiverWalletId),
        direction: directionOfPair(cls.pairedPayerWalletId),
      });
      continue;
    }

    const td = decisions.transfers[row.index];
    if (td && td.enabled === true) {
      const sameTarget = cls.kind === 'transfer' && td.targetIncomeSourceId === cls.targetIncomeSourceId;
      const counterpartOrigin =
        cls.kind === 'transfer' && sameTarget && cls.origin === 'rule'
          ? 'rule'
          : cls.kind === 'transfer' && sameTarget && cls.origin === 'counterpart'
            ? (cls.counterpartSignal ?? 'name')
            : 'manual';
      transfers.push({ rowIndex: row.index, tx, decision: td, counterpartOrigin });
      continue;
    }

    if (cls.kind === 'auto_merge') {
      const on = decisions.autoMerge[row.index] === true;
      if (!on) {
        if (decisions.newRows[row.index] === true) { inserts.push({ rowIndex: row.index, tx }); continue; }
        skippedByUser += 1;
        continue;
      }
      const manualId = cls.manualId;
      const manual = payload.manualCandidates[manualId];
      merges.push({ rowIndex: row.index, manualId, tx, writeMerchant: !manual?.merchantName });
      continue;
    }

    if (cls.kind === 'question') {
      const ans = decisions.questions[row.index];
      if (!ans) { skippedByUser += 1; continue; }
      if (ans.choice === 'merge') {
        const manual = payload.manualCandidates[ans.manualId];
        merges.push({ rowIndex: row.index, manualId: ans.manualId, tx, writeMerchant: !manual?.merchantName });
      } else {
        inserts.push({ rowIndex: row.index, tx });
      }
      continue;
    }

    if (cls.kind === 'new') {
      if (cls.existsByFingerprint) { skippedFingerprint += 1; continue; }
      if (cls.deletedByFingerprint === true) {
        if (decisions.restoreDeleted?.[row.index] === true) restores.push({ rowIndex: row.index, tx });
        else skippedPreviouslyDeleted += 1;
        continue;
      }
      const offer = decisions.questions[row.index];
      if (offer && offer.choice === 'merge') {
        const manual = payload.manualCandidates[offer.manualId];
        merges.push({ rowIndex: row.index, manualId: offer.manualId, tx, writeMerchant: !manual?.merchantName });
        continue;
      }
      const on = decisions.newRows[row.index] === true;
      if (!on) { skippedByUser += 1; continue; }
      inserts.push({ rowIndex: row.index, tx });
      continue;
    }

    if (cls.kind === 'transfer' && td?.enabled === false) {
      inserts.push({ rowIndex: row.index, tx });
      continue;
    }

    skippedByUser += 1;
  }

  return { merges, inserts, transfers, pairs, restores, skippedByUser, skippedFingerprint, skippedPreviouslyDeleted };
}

// ---------------- SLUČAJEVI ----------------

const WALLET = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

const tx = (index: number): SerializedImportedTx => ({
  index,
  dateIso: '2026-09-01T10:00:00.000Z',
  amount: 100 + index,
  type: 'expense',
  category: 'other',
  description: `row ${index}`,
  merchantName: null,
  paymentSource: `custom:${WALLET}`,
  balanceAfter: null,
  bankRowSeq: index,
  fingerprint: `fp-${index}`,
  statement_direction: 'out',
});

const classifications: any[] = [
  { kind: 'auto_merge', manualId: 'm1' },
  { kind: 'auto_merge', manualId: 'm-unknown' },
  { kind: 'question', reason: 'ambiguous', candidateIds: ['m1', 'm2'] },
  { kind: 'new', existsByFingerprint: false },
  { kind: 'new', existsByFingerprint: true },
  { kind: 'new', existsByFingerprint: false, deletedByFingerprint: true },
  {
    kind: 'transfer', targetIncomeSourceId: OTHER, ruleId: 'r1', direction: 'out',
    origin: 'rule', directionSource: 'amount', directionConflict: false,
  },
  {
    kind: 'transfer', targetIncomeSourceId: OTHER, ruleId: null, direction: 'out',
    origin: 'counterpart', counterpartSignal: 'card', directionSource: 'amount', directionConflict: false,
    pairedExistingId: 'p1', pairedPayerWalletId: WALLET, pairedReceiverWalletId: OTHER, pairedConvert: true,
  },
  {
    kind: 'transfer', targetIncomeSourceId: OTHER, ruleId: null, direction: 'in',
    origin: 'counterpart', counterpartSignal: 'name', directionSource: 'description', directionConflict: false,
    pairCandidates: [
      { id: 'p1', amount: 100, date: '2026-09-01', payerWalletId: OTHER, receiverWalletId: WALLET, origin: 'manual' },
      { id: 'p2', amount: 100, date: '2026-09-01', payerWalletId: WALLET, receiverWalletId: OTHER, origin: 'sync', convert: true },
    ],
  },
];

const choiceSets: Array<(i: number) => Partial<ImportReviewDecisions>> = [
  () => ({}),
  (i) => ({ autoMerge: { [i]: true } } as any),
  (i) => ({ newRows: { [i]: true } } as any),
  (i) => ({ questions: { [i]: { choice: 'merge', manualId: 'm1' } } } as any),
  (i) => ({ questions: { [i]: { choice: 'merge', manualId: 'm-unknown' } } } as any),
  (i) => ({ questions: { [i]: { choice: 'new' } } } as any),
  (i) => ({ restoreDeleted: { [i]: true } } as any),
  (i) => ({ transfers: { [i]: { enabled: true, targetIncomeSourceId: OTHER, direction: 'out' } } } as any),
  (i) => ({ transfers: { [i]: { enabled: false, targetIncomeSourceId: OTHER, direction: 'out' } } } as any),
  (i) => ({ unpair: { [i]: true } } as any),
  (i) => ({ pairChoice: { [i]: 'p2' } } as any),
  (i) => ({ pairChoice: { [i]: 'none' } } as any),
  (i) => ({ pairChoice: { [i]: 'nepostojeci' } } as any),
  (i) => ({ pairChoice: { [i]: 'p1' }, unpair: { [i]: true } } as any),
  (i) => ({ autoMerge: { [i]: true }, newRows: { [i]: true } } as any),
];

const emptyDecisions = (): ImportReviewDecisions =>
  ({ autoMerge: {}, questions: {}, newRows: {}, transfers: {}, pairChoice: {}, unpair: {}, restoreDeleted: {} } as any);

const mergeDecisions = (parts: Array<Partial<ImportReviewDecisions>>): ImportReviewDecisions => {
  const out: any = emptyDecisions();
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      out[key] = { ...(out[key] ?? {}), ...(value as object) };
    }
  }
  return out as ImportReviewDecisions;
};

const buildPayload = (rows: any[]): ImportReviewPayload =>
  ({
    jobId: 'job', sourceId: WALLET, sourceName: 'Test', createdAt: 0, batchId: 'batch',
    rows,
    manualCandidates: {
      m1: { id: 'm1', date: '2026-09-01', amount: 100, type: 'expense', merchantName: 'Konzum' },
      m2: { id: 'm2', date: '2026-09-01', amount: 100, type: 'expense', merchantName: null },
    },
    importedTransactions: rows.map((r: any) => tx(r.index)),
    availableTargets: [],
  }) as any;

describe('jezgra odluke: uvoz prije i poslije daje isti plan', () => {
  const cases: Array<{ name: string; payload: ImportReviewPayload; decisions: ImportReviewDecisions }> = [];

  classifications.forEach((cls, ci) => {
    choiceSets.forEach((mk, di) => {
      const rows = [{ index: 0, date: '2026-09-01', amount: 100, type: 'expense', classification: cls }];
      cases.push({
        name: `${cls.kind}#${ci} × odluka#${di}`,
        payload: buildPayload(rows),
        decisions: mergeDecisions([mk(0)]),
      });
    });
  });

  // Višeredni slučaj: sve grane odjednom, provjera redoslijeda.
  const multiRows = classifications.map((cls, i) => ({
    index: i, date: '2026-09-01', amount: 100 + i, type: 'expense', classification: cls,
  }));
  cases.push({
    name: 'svi redci odjednom',
    payload: buildPayload(multiRows),
    decisions: mergeDecisions(multiRows.map((_, i) => choiceSets[(i + 1) % choiceSets.length](i))),
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const before = legacyPlanExecution(c.payload, c.decisions);
    const after = planExecution(c.payload, c.decisions, 'user-1');
    expect(after).toEqual(before);
  });

  it('pokriva sve grane odluke', () => {
    let merges = 0, inserts = 0, transfers = 0, pairs = 0, restores = 0, skipped = 0;
    for (const c of cases) {
      const plan = planExecution(c.payload, c.decisions, 'user-1');
      merges += plan.merges.length;
      inserts += plan.inserts.length;
      transfers += plan.transfers.length;
      pairs += plan.pairs.length;
      restores += plan.restores.length;
      skipped += plan.skippedByUser + plan.skippedFingerprint + plan.skippedPreviouslyDeleted;
    }
    expect(merges).toBeGreaterThan(0);
    expect(inserts).toBeGreaterThan(0);
    expect(transfers).toBeGreaterThan(0);
    expect(pairs).toBeGreaterThan(0);
    expect(restores).toBeGreaterThan(0);
    expect(skipped).toBeGreaterThan(0);
    expect(cases.length).toBeGreaterThanOrEqual(136);
  });
});
