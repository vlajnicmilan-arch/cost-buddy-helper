/**
 * REGRESIJA — smjer novca pri uvozu izvoda (Aircash, 7.8.2026).
 *
 * Stvarni kvar: pet redaka „Uplata na Aircash Google Pay" (nadoplate KOJE
 * ULAZE u Aircash) uvoz je knjižio kao odljev s Aircasha — saldo −526,96 €
 * umjesto nule.
 *
 * Sa STARIM kodom ovaj test pada: executor je slijepo pisao
 * payment_source = novčanik izvoda, income_source_id = korisnikov odabir.
 */
import { describe, it, expect } from 'vitest';
import { executeDecisions, type ExecutorSupabaseClient } from '../executor';
import { buildInitialDecisions, setTransferDecision, isTransferResolved } from '../state';
import { classifyTransferDescription } from '@/lib/moneyDirection';
import type { ImportReviewPayload } from '../types';

const AIRCASH = '0716b12f-6723-4b60-a089-673e8187df0d';
const REVOLUT = '11111111-2222-3333-4444-555555555555';
const DESC = 'Uplata na Aircash Google Pay';

function fakeClient() {
  const upserts: any[][] = [];
  const client: ExecutorSupabaseClient = {
    from() {
      return {
        upsert(rows: any[]) {
          return {
            async select() {
              upserts.push(rows);
              return { data: rows.map(r => ({ id: r.bank_transaction_id })), error: null };
            },
          };
        },
      } as any;
    },
  };
  return { client, upserts };
}

const payload: ImportReviewPayload = {
  jobId: 'job-aircash',
  sourceId: AIRCASH,
  sourceName: 'Aircash',
  createdAt: 0,
  batchId: 'batch-aircash',
  manualCandidates: {},
  availableTargets: [{ id: REVOLUT, name: 'Revolut', key: `custom:${REVOLUT}` }],
  rows: [
    {
      index: 0,
      date: '2026-07-26T00:00:00.000Z',
      amount: 75.19,
      type: 'transfer',
      merchantName: null,
      description: DESC,
      fingerprint: 'fp-0',
      classification: {
        kind: 'transfer',
        targetIncomeSourceId: '',
        ruleId: null,
        direction: classifyTransferDescription(DESC).direction,
        origin: 'keyword',
        directionSource: 'description',
        directionConflict: false,
      },
    },
  ],
  importedTransactions: [
    {
      index: 0,
      dateIso: '2026-07-26T00:00:00.000Z',
      amount: 75.19,
      type: 'transfer',
      category: 'transfer',
      description: DESC,
      merchantName: null,
      paymentSource: `custom:${AIRCASH}`,
      balanceAfter: null,
      bankRowSeq: 0,
      fingerprint: 'fp-0',
    },
  ],
};

describe('regresija — nadoplata Aircasha mora biti Revolut → Aircash', () => {
  it('opis nosi smjer IN', () => {
    expect(classifyTransferDescription(DESC)).toMatchObject({ isTransfer: true, direction: 'in' });
  });

  it('executor upisuje Revolut kao platitelja, Aircash kao primatelja', async () => {
    let decisions = buildInitialDecisions(payload);
    // Korisnik odabere drugu stranu (Revolut); smjer dolazi iz opisa.
    decisions = setTransferDecision(decisions, 0, {
      enabled: true,
      targetIncomeSourceId: REVOLUT,
      direction: 'in',
      rememberRule: false,
      merchantKey: null,
      sourceWalletKey: null,
    });
    expect(isTransferResolved(decisions.transfers[0])).toBe(true);

    const { client, upserts } = fakeClient();
    const res = await executeDecisions({
      supabase: client,
      userId: 'u1',
      activeBusinessProfileId: null,
      payload,
      decisions,
    });

    expect(res.errors).toEqual([]);
    expect(res.transfersCreated).toBe(1);
    const row = upserts.flat()[0];
    expect(row.type).toBe('transfer');
    expect(row.payment_source).toBe(`custom:${REVOLUT}`);
    expect(row.income_source_id).toBe(AIRCASH);
  });

  it('bez smjera executor ne piše ništa', async () => {
    let decisions = buildInitialDecisions(payload);
    decisions = setTransferDecision(decisions, 0, {
      enabled: true,
      targetIncomeSourceId: REVOLUT,
      direction: null,
      rememberRule: false,
      merchantKey: null,
      sourceWalletKey: null,
    });
    const { client, upserts } = fakeClient();
    await expect(executeDecisions({
      supabase: client,
      userId: 'u1',
      activeBusinessProfileId: null,
      payload,
      decisions,
    })).rejects.toMatchObject({ executionErrors: ['transfer:0:missing_direction'] });
    expect(upserts).toEqual([]);
  });
});
