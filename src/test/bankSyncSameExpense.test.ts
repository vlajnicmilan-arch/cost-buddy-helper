/**
 * Nalog 2 od 4 — sinkronizacija koristi pravilo „isti trošak".
 * Stvarni tekstovi iz produkcije; anonimizirani su samo id-evi i vlasnik.
 */
import { describe, it, expect } from 'vitest';
import {
  cardWalletMapFrom,
  chooseSyncMerge,
  planSyncSameExpense,
  toBankRuleRow,
  toManualRuleRow,
  type SyncCandidateDbRow,
  type SyncSameExpenseEntry,
} from '../../supabase/functions/_shared/bankSyncSameExpense.ts';
import { decideSameExpenseAutoBatch } from '../../supabase/functions/_shared/sameExpenseRule.ts';
import { BankSyncShadow } from '../../supabase/functions/_shared/bankSyncShadow.ts';
import { pickMergeTarget } from '../../supabase/functions/_shared/bankSyncDecision.ts';

const OWNER = 'aa000000-0000-4000-8000-000000000001';
const OTHER = 'bb000000-0000-4000-8000-000000000002';
const W = 'cc000000-0000-4000-8000-000000000003';
const W2 = 'dd000000-0000-4000-8000-000000000004';
const SRC = `custom:${W}`;
const CARDS = cardWalletMapFrom([
  { id: 'card-7246', payment_source_id: W },
  { id: 'card-2081', payment_source_id: W },
  { id: 'card-9999', payment_source_id: W2 },
]);

const manualRow = (id: string, amount: number, date: string, merchant: string | null, over: Partial<SyncCandidateDbRow> = {}): SyncCandidateDbRow => ({
  id, user_id: OWNER, amount, date: `${date}T10:00:00+00:00`, type: 'expense', description: null, merchant_name: merchant,
  payment_source: SRC, payment_source_card_id: null, expense_nature: 'regular', is_advance: false, linked_advance_ids: null,
  deleted_at: null, bank_transaction_id: null, bank_match_status: 'manual', status: 'approved', ...over,
});

const entry = (stableId: string, amount: number, date: string, counterparty: string, cardId: string | null, candidates: SyncCandidateDbRow[]): SyncSameExpenseEntry => ({
  bank: { stableId, userId: OWNER, paymentSource: SRC, type: 'expense', amount, date: `${date}T00:00:00.000Z`, counterparty, description: counterparty, cardId },
  candidates,
});

const baustoffManual = manualRow('m-baustoff', 60.96, '2026-08-01', 'Baustoff + Metall', { description: 'Građevinski materijal (Knauf, profili)', payment_source_card_id: 'card-7246' });
const baustoffBank = () => entry('bt-baustoff', 60.96, '2026-08-03', 'BAUSTOFF + METALL - 462765XXXXXX2081, BAUSTOFF + METALL ZADAR', 'card-2081', [baustoffManual]);
const petrolManual = manualRow('m-petrol', 113.87, '2026-08-03', 'Petrol');
const petrolBank = () => entry('bt-petrol', 113.87, '2026-08-05', 'PETROL PM ZADAR JADRANSKA - 462765XXXXXX2081, PETROL PM ZADAR JADRANSKA ZADAR', null, [petrolManual]);

describe('sync × isti trošak — match', () => {
  it('Baustoff 60,96: token 7246 ↔ fizička 2081 istog novčanika → match', () => {
    const r = planSyncSameExpense([baustoffBank()], CARDS).get('bt-baustoff')!;
    expect(r.outcome).toBe('match');
    expect(r.candidate?.id).toBe('m-baustoff');
    expect(chooseSyncMerge(r, null, new Set())).toEqual({ kind: 'rule', id: 'm-baustoff' });
  });
  it('Petrol 113,87 → match', () => {
    const r = planSyncSameExpense([petrolBank()], CARDS).get('bt-petrol')!;
    expect(r.outcome).toBe('match');
    expect(r.candidate?.id).toBe('m-petrol');
  });
  it('oba u istom pokretanju → oba match', () => {
    const plan = planSyncSameExpense([baustoffBank(), petrolBank()], CARDS);
    expect(plan.get('bt-baustoff')!.candidate?.id).toBe('m-baustoff');
    expect(plan.get('bt-petrol')!.candidate?.id).toBe('m-petrol');
  });
});

describe('sync × isti trošak — cestarina 17,70', () => {
  const toll = manualRow('m-hac', 17.7, '2026-08-10', 'Hrvatske autoceste', { description: 'Cestarina: Zagreb Istok - Osijek' });
  const entries = [
    entry('bt-hac-osijek', 17.7, '2026-08-10', 'Hrvatske autoceste, Osijek', null, [toll]),
    entry('bt-hac-dugoselo', 17.7, '2026-08-10', 'Hrvatske autoceste, Dugo Selo', null, [toll]),
  ];
  it('nijedan se ne spaja, oba razloga u dijagnostici', () => {
    const plan = planSyncSameExpense(entries, CARDS);
    const shadow = new BankSyncShadow({ sessionId: 's', userId: OWNER, bankAccountId: 'ba' });
    for (const e of entries) {
      const r = plan.get(e.bank.stableId)!;
      expect(r.outcome).toBe('ambiguous');
      expect(chooseSyncMerge(r, null, new Set()).kind).toBe('none');
      shadow.noteSameExpenseUndecided({ bank_transaction_id: e.bank.stableId, candidate_ids: r.passing.map((c) => c.id), outcome: 'ambiguous', reason: r.reason });
    }
    const log = shadow.summaryLog() as any;
    expect(log.details.same_expense_undecided).toEqual([
      { bank_transaction_id: 'bt-hac-osijek', candidate_ids: ['m-hac'], outcome: 'ambiguous', reason: 'candidate_wanted_by_multiple_bank_rows' },
      { bank_transaction_id: 'bt-hac-dugoselo', candidate_ids: ['m-hac'], outcome: 'ambiguous', reason: 'candidate_wanted_by_multiple_bank_rows' },
    ]);
    const text = JSON.stringify(log);
    expect(text).not.toContain('17.7');
    expect(text).not.toContain('autoceste');
  });
  it('ishod jednak decideSameExpenseAutoBatch', () => {
    const plan = planSyncSameExpense(entries, CARDS);
    const direct = decideSameExpenseAutoBatch(entries.map((e) => toBankRuleRow(e.bank)), [toManualRuleRow(toll)], CARDS);
    expect(entries.map((e) => [plan.get(e.bank.stableId)!.outcome, plan.get(e.bank.stableId)!.reason]))
      .toEqual(direct.map((d) => [d.outcome, d.reason]));
  });
});

describe('sync × isti trošak — zaštite', () => {
  it('kandidat drugog vlasnika se nikad ne odabire', () => {
    const e = entry('bt-x', 113.87, '2026-08-05', 'PETROL PM ZADAR JADRANSKA', null, [{ ...petrolManual, user_id: OTHER }]);
    const r = planSyncSameExpense([e], CARDS).get('bt-x')!;
    expect(r.outcome).toBe('none');
    expect(r.candidate).toBeNull();
  });
  it('kartica drugog novčanika ne spaja', () => {
    const e = entry('bt-y', 60.96, '2026-08-03', 'BAUSTOFF + METALL ZADAR', 'card-9999', [baustoffManual]);
    expect(planSyncSameExpense([e], CARDS).get('bt-y')!.outcome).not.toBe('match');
  });
  it('status koji se ne broji i vlastiti stableId ne ulaze', () => {
    const e = entry('bt-z', 113.87, '2026-08-05', 'PETROL PM ZADAR', null, [
      { ...petrolManual, status: 'pending' },
      { ...petrolManual, id: 'm-self', bank_transaction_id: 'bt-z', bank_match_status: 'manual' },
    ]);
    expect(planSyncSameExpense([e], CARDS).get('bt-z')!.outcome).toBe('none');
  });
  it('kandidati tipa prijenos ne ulaze u pravilo', () => {
    const e = entry('bt-t', 113.87, '2026-08-05', 'PETROL PM ZADAR', null, [{ ...petrolManual, type: 'transfer' }]);
    expect(planSyncSameExpense([e], CARDS).get('bt-t')!.outcome).toBe('none');
  });
  it('ručni redak već spojen u ovom pokretanju se ne spaja drugi put', () => {
    const r = planSyncSameExpense([petrolBank()], CARDS).get('bt-petrol')!;
    expect(chooseSyncMerge(r, null, new Set(['m-petrol'])).kind).toBe('none');
  });
  it('kandidat-prijenos (stari put) samo kad pravilo nema nikoga', () => {
    const none = planSyncSameExpense([entry('bt-n', 1, '2026-08-05', 'X Y Z', null, [])], CARDS).get('bt-n');
    expect(chooseSyncMerge(none, 'tr-1', new Set())).toEqual({ kind: 'transfer', id: 'tr-1' });
    const match = planSyncSameExpense([petrolBank()], CARDS).get('bt-petrol');
    expect(chooseSyncMerge(match, 'tr-1', new Set()).kind).toBe('none');
  });
  it('grana prijenosa: pickMergeTarget nepromijenjen', () => {
    const t = pickMergeTarget(
      [{ id: 'tr', amount: 50, date: '2026-08-05', description: 'Prijenos Revolut', type: 'transfer' }],
      { amount: 50, date: '2026-08-06', counterparty: 'Prijenos Revolut' },
    );
    expect(t?.id).toBe('tr');
  });
});
