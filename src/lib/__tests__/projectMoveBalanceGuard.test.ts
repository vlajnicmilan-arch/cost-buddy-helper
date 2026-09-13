/**
 * BRANA SALDA: premještanje projekta (osobno ↔ tvrtka) mijenja samo
 * `business_profile_id` na projektu i njegovim troškovima. Stanje svakog
 * novčanika mora ostati identično do centa, u oba smjera.
 */
import { describe, it, expect } from 'vitest';
import { BalanceEngine, type Expense } from '@/lib/balance/balanceEngineMirror';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

const expense = (id: string, amount: number, source: string, type: Expense['type'] = 'expense'): Expense => ({
  id,
  type,
  amount,
  payment_source: `custom:${source}`,
  income_source_id: null,
  date: d('2026-09-01'),
  event_at: null,
  time_confidence: 'C3',
  expense_nature: 'regular',
  deleted_at: null,
});

const snapshot = (e: BalanceEngine) =>
  Object.fromEntries([...e.sources.values()].map((s) => [s.id, s.balance]));

const build = () => {
  const engine = new BalanceEngine('day_cut');
  // osobni keš (bez sidra) + poslovni račun (sa sidrom)
  engine.addSource({ id: 'kes', balance: 300, correction_anchor_date: null, correction_anchor_balance: null });
  engine.addSource({ id: 'biz', balance: 0, correction_anchor_date: d('2026-08-01'), correction_anchor_balance: 1000 });
  engine.insert(expense('e1', 40, 'kes'));
  engine.insert(expense('e2', 25, 'kes'));
  engine.insert(expense('e3', 120, 'biz'));
  engine.insert(expense('e4', 500, 'biz', 'income'));
  return engine;
};

describe('premještanje projekta ne dira stanja novčanika', () => {
  it('osobno → tvrtka: saldo po svakom novčaniku identičan', () => {
    const engine = build();
    const before = snapshot(engine);
    // "premještanje" = re-označavanje dosega; ni jedno polje koje ulazi u
    // izračun (iznos, novčanik, datum, narav, brisanje) se ne mijenja.
    for (const id of ['e1', 'e2', 'e3', 'e4']) {
      engine.update(id, { ...({ business_profile_id: 'biz-1' } as any) });
    }
    expect(snapshot(engine)).toEqual(before);
  });

  it('tvrtka → osobno: saldo po svakom novčaniku identičan', () => {
    const engine = build();
    const before = snapshot(engine);
    for (const id of ['e1', 'e2', 'e3', 'e4']) {
      engine.update(id, { ...({ business_profile_id: null } as any) });
    }
    expect(snapshot(engine)).toEqual(before);
  });

  it('trošak plaćen iz osobnog keša ostaje vezan na taj novčanik', () => {
    const engine = build();
    engine.update('e1', { ...({ business_profile_id: 'biz-1' } as any) });
    expect(engine.expenses.get('e1')!.payment_source).toBe('custom:kes');
  });
});
