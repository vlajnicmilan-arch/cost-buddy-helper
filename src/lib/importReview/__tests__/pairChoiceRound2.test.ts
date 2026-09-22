/**
 * DVOSMISLEN PAR U PREGLEDU UVOZA — dok korisnik ne odabere s čime se redak
 * spaja, potvrda je zaključana. Odabir kandidata daje par (uz pretvorbu),
 * „nijedan" vraća redak u redovni put.
 */
import { describe, it, expect } from 'vitest';
import { planExecution, IMPORT_LOCAL_OWNER } from '../executor';
import {
  buildInitialDecisions,
  setPairChoice,
  getPairChoice,
  summarize,
  PAIR_CHOICE_NONE,
} from '../state';
import { buildBlockerMessages, firstBlockingRowIndex } from '../confirmBlockers';
import type { ImportReviewPayload, SerializedImportedTx } from '../types';

const REVOLUT = '4934f97e-7621-443e-94c1-be5729e87ef0';
const AIRCASH = '0716b12f-6723-4b60-a089-673e8187df0d';

const tx: SerializedImportedTx = {
  index: 0,
  dateIso: '2026-09-15T00:00:00.000Z',
  amount: 100,
  type: 'transfer',
  category: 'transfer',
  description: 'Nadoplata Google Pay',
  merchantName: null,
  paymentSource: `custom:${AIRCASH}`,
  balanceAfter: null,
  bankRowSeq: 0,
  fingerprint: 'fp-0',
};

const payload: ImportReviewPayload = {
  jobId: 'job-1',
  sourceId: AIRCASH,
  sourceName: 'Aircash',
  createdAt: 0,
  batchId: 'batch-1',
  availableTargets: [],
  manualCandidates: {},
  importedTransactions: [tx],
  rows: [
    {
      index: 0,
      date: '2026-09-15',
      amount: 100,
      type: 'transfer',
      description: 'Nadoplata Google Pay',
      merchantName: null,
      classification: {
        kind: 'transfer',
        targetIncomeSourceId: '',
        ruleId: null,
        direction: 'in',
        pairCandidates: [
          {
            id: 'inc1', date: '2026-09-15', amount: 100,
            payerWalletId: REVOLUT, receiverWalletId: AIRCASH,
            description: 'nadoplata od Google Pay do *1664', origin: 'sync', convert: true,
          },
          {
            id: 'inc2', date: '2026-09-15', amount: 100,
            payerWalletId: REVOLUT, receiverWalletId: AIRCASH,
            description: 'nadoplata od Google Pay do *1664', origin: 'sync', convert: true,
          },
        ],
      },
    } as never,
  ],
};

const t = (key: string, params?: Record<string, unknown>) => `${key}:${params?.count ?? ''}`;

describe('odabir druge strane kod dvosmislenog para', () => {
  it('bez odabira potvrda je zaključana i redak je označen kao sporan', () => {
    const d = buildInitialDecisions(payload);
    const s = summarize(payload, d);
    expect(s.unchosenPairs).toBe(1);
    expect(s.canConfirm).toBe(false);
    expect(firstBlockingRowIndex(payload, d)).toBe(0);
    expect(buildBlockerMessages(s, t)).toContain('importReview.pair.blocked:1');
  });

  it('odabran kandidat daje par s pretvorbom i bez novog retka', () => {
    const d = setPairChoice(buildInitialDecisions(payload), 0, 'inc2');
    expect(getPairChoice(d, 0)).toBe('inc2');

    const s = summarize(payload, d);
    expect(s.unchosenPairs).toBe(0);
    expect(s.plannedPairs).toBe(1);
    expect(s.canConfirm).toBe(true);

    const plan = planExecution(payload, d, IMPORT_LOCAL_OWNER);
    expect(plan.pairs).toHaveLength(1);
    expect(plan.pairs[0]).toMatchObject({
      existingId: 'inc2',
      convert: true,
      counterpartSourceId: REVOLUT,
      direction: 'in',
    });
    expect(plan.inserts).toHaveLength(0);
    expect(plan.transfers).toHaveLength(0);
  });

  it('„nijedan — ovo je novi prijenos" ne stvara par', () => {
    const d = setPairChoice(buildInitialDecisions(payload), 0, PAIR_CHOICE_NONE);
    const s = summarize(payload, d);
    expect(s.unchosenPairs).toBe(0);
    expect(s.plannedPairs).toBe(0);
    // Redak se vraća u redovni put — kao prijenos bez odredišta, koji dalje
    // traži odabir odredišta (postojeća brana, ne nova).
    expect(s.unresolvedTransfers).toBe(1);
    expect(planExecution(payload, d, IMPORT_LOCAL_OWNER).pairs).toHaveLength(0);
  });
});
