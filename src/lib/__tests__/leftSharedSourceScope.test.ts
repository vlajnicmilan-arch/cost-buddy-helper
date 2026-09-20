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
