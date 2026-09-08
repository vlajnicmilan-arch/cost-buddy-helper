/**
 * Jedan izvor financijskih brojki + pravila iz odluke (rujan 2026).
 *
 * Živi fixture: projekt „Adaptacija stana" — budžet 40.000, ugovoreno 50.000,
 * jedan trošak 125,50, jedna faza (rezerva) s planiranim troškom 4.000.
 */
import { describe, expect, it } from 'vitest';
import { getProjectFinancials } from '../projectFinancials';
import { getCostBaseline } from '../projectCostBaseline';
import { canShowHealthBadge } from '../projectHealthScore';

const ADAPTACIJA = {
  project: { contract_value: 50000, total_budget: 40000 },
  milestones: [{ budget: 4000, investor_price: null }],
  expenses: [{ id: 'e1', amount: 125.5, type: 'expense', status: 'approved' }],
};

describe('getProjectFinancials — jedinice', () => {
  it('nazivnik je budžet projekta (40.000), nikad ugovoreno ni zbroj faza', () => {
    const f = getProjectFinancials(ADAPTACIJA);
    expect(f.budget).toBe(40000);
    expect(f.budgetSource).toBe('project_budget');
    expect(f.spent).toBeCloseTo(125.5, 2);
    expect(f.remainingBudget).toBeCloseTo(39874.5, 2);
    expect(f.pctSpent).toBeCloseTo(0.31, 2);
    expect(f.budget).not.toBe(50000);
    expect(f.budget).not.toBe(4000);
  });

  it('ugovoreno 50.000 i marža 49.874,50 — ugovor je upisan, nije procjena', () => {
    const f = getProjectFinancials(ADAPTACIJA);
    expect(f.contracted).toBe(50000);
    expect(f.contractedIsEstimate).toBe(false);
    expect(f.margin).toBeCloseTo(49874.5, 2);
  });

  it('bez upisanog ugovora: ugovoreno je procjena iz budžeta i marže NEMA', () => {
    const f = getProjectFinancials({
      project: { contract_value: null, total_budget: 40000 },
      milestones: ADAPTACIJA.milestones,
      expenses: ADAPTACIJA.expenses,
    });
    expect(f.contracted).toBe(40000);
    expect(f.contractedIsEstimate).toBe(true);
    expect(f.margin).toBeNull();
    expect(f.marginPct).toBeNull();
  });

  it('bez budžeta i faza osnovica pada na ugovoreno', () => {
    const f = getProjectFinancials({
      project: { contract_value: 12000, total_budget: 0 },
      expenses: ADAPTACIJA.expenses,
    });
    expect(f.budgetSource).toBe('contract');
    expect(f.budget).toBe(12000);
  });

  it('bez ijedne brojke nema osnovice — nema postotka ni preostalog', () => {
    const f = getProjectFinancials({ project: { contract_value: null, total_budget: 0 } });
    expect(f.hasBudget).toBe(false);
    expect(f.remainingBudget).toBeNull();
    expect(f.pctSpent).toBeNull();
    expect(f.level).toBe('neutral');
  });
});

describe('(a) svi ekrani dobivaju isti nazivnik', () => {
  it('popis, početna, Pregled, Budžet i Financiranje čitaju istu osnovicu', () => {
    // Popis/početna nemaju učitane faze — osnovica mora ostati ista.
    const withPhases = getProjectFinancials(ADAPTACIJA);
    const withoutPhases = getProjectFinancials({
      project: ADAPTACIJA.project,
      expenses: ADAPTACIJA.expenses,
    });
    expect(withoutPhases.budget).toBe(withPhases.budget);
    expect(withoutPhases.remainingBudget).toBeCloseTo(withPhases.remainingBudget!, 2);
    // I izravni poziv osnovice daje isto — nema drugog nazivnika u sustavu.
    expect(getCostBaseline(ADAPTACIJA.project, ADAPTACIJA.milestones).value).toBe(40000);
  });
});

describe('(b) napomena o pokrivenosti faza', () => {
  it('faze pokrivaju 4.000 od 40.000 — činjenica se ne skriva', () => {
    const f = getProjectFinancials(ADAPTACIJA);
    expect(f.phaseBudgetCoverage).toEqual({ phasesTotal: 4000, budget: 40000 });
  });

  it('kad faze pokrivaju cijeli budžet, napomene nema', () => {
    const f = getProjectFinancials({
      project: { contract_value: 50000, total_budget: 40000 },
      milestones: [{ budget: 40000, investor_price: null }],
    });
    expect(f.phaseBudgetCoverage).toBeNull();
  });

  it('kad faze nemaju planirani trošak, napomene nema', () => {
    const f = getProjectFinancials({
      project: { contract_value: 50000, total_budget: 40000 },
      milestones: [{ budget: null, investor_price: 1000 }],
    });
    expect(f.phaseBudgetCoverage).toBeNull();
  });
});

describe('(c) zeleni postotak uz crveno upozorenje više nije moguć', () => {
  it('razina prati isti nazivnik kao postotak', () => {
    const over = getProjectFinancials({
      project: { contract_value: 50000, total_budget: 40000 },
      expenses: [{ id: 'x', amount: 41000, type: 'expense', status: 'approved' }],
    });
    expect(over.pctSpent).toBeGreaterThan(100);
    expect(over.remainingBudget).toBeLessThan(0);
    expect(over.level).toBe('critical');
  });
});

describe('(d) marža', () => {
  it('ostvarena marža je ugovoreno − potrošeno', () => {
    const f = getProjectFinancials({
      project: { contract_value: 10000, total_budget: 8000 },
      expenses: [{ id: 'x', amount: 2000, type: 'expense', status: 'approved' }],
    });
    expect(f.margin).toBe(8000);
    expect(f.marginPct).toBeCloseTo(80, 6);
  });

  it('marža nikad ne izlazi kad je ugovoreno = budžet (procjena)', () => {
    const f = getProjectFinancials({
      project: { total_budget: 8000 },
      expenses: [{ id: 'x', amount: 2000, type: 'expense', status: 'approved' }],
    });
    expect(f.margin).toBeNull();
  });
});

describe('(e) značka ocjene tek kad ima iz čega', () => {
  it('prazan projekt bez datuma → nema značke', () => {
    expect(canShowHealthBadge({ startDate: null, endDate: null, milestones: [] })).toBe(false);
  });

  it('datumi bez ijedne završene faze → nema značke', () => {
    expect(
      canShowHealthBadge({
        startDate: '2026-01-01',
        endDate: '2026-06-01',
        milestones: [{ status: 'pending' }, { status: 'in_progress' }],
      })
    ).toBe(false);
  });

  it('samo jedan datum → nema značke', () => {
    expect(
      canShowHealthBadge({
        startDate: '2026-01-01',
        endDate: null,
        milestones: [{ status: 'completed' }],
      })
    ).toBe(false);
  });

  it('oba datuma + završena faza → značka se prikazuje', () => {
    expect(
      canShowHealthBadge({
        startDate: '2026-01-01',
        endDate: '2026-06-01',
        milestones: [{ status: 'completed' }, { status: 'pending' }],
      })
    ).toBe(true);
  });
});
