/**
 * IZLAZAK IZ DIJELJENOG NOVČANIKA — prikaz nakon izlaska.
 *
 * Nakon brisanja članstva novčanik više nije u mapi `custom_payment_sources`,
 * pa je za `viewModeScope` "nepoznat". To je NAMJERNO ponašanje:
 *   - trošak plaćen s napuštenog računa NE ulazi u osobni pogled;
 *   - prijenos iz korisnikova novčanika U napušteni račun ULAZI kao odljev,
 *     s imenom odredišta iz snimke (`counterparty_name_snapshot`).
 */
import { describe, it, expect } from 'vitest';
import { applyViewModeFilter, isPersonalRow } from '../viewModeScope';
import { resolveTransferEndpoints } from '../transferMatching';
import type { Expense } from '@/types/expense';

const LEFT = 'd5f87bf1-e9ac-4a60-a201-44db6fe4d3ca';
const MINE = 'aaaa1111-0000-0000-0000-000000000001';

// Mapa nakon izlaska: napušteni novčanik više NIJE u njoj.
const map = new Map<string, string | null>([[MINE, null]]);

describe('napušteni dijeljeni novčanik', () => {
  it('trošak s napuštenog računa nije osoban', () => {
    const spend = { payment_source: `custom:${LEFT}`, type: 'expense' };
    expect(isPersonalRow(spend, map)).toBe(false);
    expect(
      applyViewModeFilter([spend], {
        isPersonalView: true,
        isBusinessView: false,
        viewBusinessProfileId: null,
        sourceBusinessMap: map,
      }),
    ).toHaveLength(0);
  });

  it('prijenos iz vlastitog novčanika u napušteni ostaje vidljiv kao odljev', () => {
    const out = { payment_source: `custom:${MINE}`, type: 'transfer', income_source_id: LEFT };
    expect(isPersonalRow(out, map)).toBe(true);
    expect(
      applyViewModeFilter([out], {
        isPersonalView: true,
        isBusinessView: false,
        viewBusinessProfileId: null,
        sourceBusinessMap: map,
      }),
    ).toHaveLength(1);
  });

  it('ime odredišta dolazi iz snimke kad novčanik više nije vidljiv', () => {
    const expense = {
      type: 'transfer',
      payment_source: `custom:${MINE}`,
      income_source_id: LEFT,
      counterparty_name_snapshot: 'PBZ Solin kredit',
    } as unknown as Expense;
    const resolved = resolveTransferEndpoints(expense, [
      { id: MINE, name: 'Moj račun', icon: '💳', color: '#000' },
    ]);
    expect(resolved?.to.name).toBe('PBZ Solin kredit');
  });
});

/**
 * Točka 9 — simetrija: prijenos IZ napuštenog novčanika U korisnikov ostaje
 * vidljiv kao PRILJEV, s imenom platitelja iz snimke.
 */
describe('priljev iz napuštenog dijeljenog novčanika', () => {
  const inflow = { payment_source: `custom:${LEFT}`, type: 'transfer', income_source_id: MINE };

  it('ulazi u osobni pogled kao priljev u vlastiti novčanik', () => {
    expect(isPersonalRow(inflow, map)).toBe(true);
    expect(
      applyViewModeFilter([inflow], {
        isPersonalView: true,
        isBusinessView: false,
        viewBusinessProfileId: null,
        sourceBusinessMap: map,
      }),
    ).toHaveLength(1);
  });

  it('nepoznat platitelj bez vlastitog primatelja ostaje skriven', () => {
    const orphan = { payment_source: `custom:${LEFT}`, type: 'transfer', income_source_id: null };
    expect(isPersonalRow(orphan, map)).toBe(false);
    const foreignDest = {
      payment_source: `custom:${LEFT}`,
      type: 'transfer',
      income_source_id: 'ffffffff-0000-0000-0000-000000000009',
    };
    expect(isPersonalRow(foreignDest, map)).toBe(false);
  });

  it('ime platitelja dolazi iz snimke', () => {
    const expense = {
      type: 'transfer',
      payment_source: `custom:${LEFT}`,
      income_source_id: MINE,
      payer_name_snapshot: 'PBZ Solin kredit',
    } as unknown as Expense;
    const resolved = resolveTransferEndpoints(expense, [
      { id: MINE, name: 'Keš', icon: '💵', color: '#000' },
    ]);
    expect(resolved?.from.name).toBe('PBZ Solin kredit');
    expect(resolved?.to.name).toBe('Keš');
  });

  it('tekući saldo popisa novčanika računa priljev kao +iznos', () => {
    // Zrcalo pravila iz PaymentSourceTransactionsDialog: inbound transfer je +.
    const effect = (e: { type: string; income_source_id?: string | null; amount: number }) =>
      e.type === 'transfer' && e.income_source_id === MINE ? e.amount : -e.amount;
    const rows = [
      { type: 'transfer', income_source_id: MINE, amount: 10990 },
      { type: 'transfer', income_source_id: MINE, amount: 1900 },
      { type: 'transfer', income_source_id: MINE, amount: 500 },
    ];
    expect(rows.reduce((sum, r) => sum + effect(r), 0)).toBe(13390);
  });
});
