/**
 * Korak F — planirana marža, osnovica za pragove, natpisi.
 *
 * Ulazne brojke su POVUČENE IZ PRODUKCIJE (stanje na dan izrade koraka F):
 *
 *   Duje i Dunja   contract_value 42.333,52 · total_budget 30.000,00
 *                  28 faza · 0 s planiranim troškom · 28 s cijenom
 *                  Σ investor_price 41.778,65 · potrošeno 29.348,77
 *   Lucija i Mate  contract_value 29.700,00 · 9 faza · 1 s cijenom (2.900,00)
 *                  Σ investor_price 2.900,00 · potrošeno 10.660,14
 *   Solin          contract_value NULL · total_budget 0 · 17 faza bez iznosa
 *                  potrošeno 159,63
 *   Eda Zg         completed · contract_value NULL · total_budget 1.000,00 · 0 faza
 */
import { describe, expect, it } from 'vitest';
import {
  computeProjectPlannedMargin,
  computeContractPhaseNote,
  getPhasePriceCoverage,
  sumInvestorPrice,
  sumPlannedCost,
} from '../projectPlannedMargin';
import {
  getBaselineSummary,
  getCostBaseline,
  getHealthLevel,
} from '../projectCostBaseline';
import {
  getRemainderLabels,
  getRemainderStatusLabel,
  getRemainderTrafficLabel,
  getRemainderWarningLabel,
} from '../projectMetricLabels';

// --- Produkcijski fixtures -------------------------------------------------

const DUJE = {
  project: { contract_value: 42333.52, total_budget: 30000 },
  spent: 29348.77,
  // 28 faza: sve imaju cijenu, nijedna nema planirani trošak.
  milestones: [
    { budget: null, investor_price: 5020 },
    { budget: null, investor_price: 4778.65 },
    ...Array.from({ length: 26 }, () => ({ budget: null, investor_price: 1230 })),
  ],
};
const DUJE_PRICE_SUM = 41778.65; // 5020 + 4778.65 + 26 × 1230

const LUCIJA = {
  project: { contract_value: 29700, total_budget: 29700 },
  spent: 10660.14,
  milestones: [
    { budget: null, investor_price: 2900 },
    ...Array.from({ length: 8 }, () => ({ budget: null, investor_price: null })),
  ],
};

const SOLIN = {
  project: { contract_value: null, total_budget: 0 },
  spent: 159.63,
  milestones: Array.from({ length: 17 }, () => ({ budget: null, investor_price: null })),
};

const EDA = {
  project: { contract_value: null, total_budget: 1000 },
  spent: 0,
  milestones: [] as Array<{ budget: number | null; investor_price: number | null }>,
};

describe('produkcijski fixtures — zbrojevi faza', () => {
  it('Duje: 28 faza s cijenom, nijedna s planiranim troškom', () => {
    expect(DUJE.milestones).toHaveLength(28);
    expect(sumInvestorPrice(DUJE.milestones)).toBeCloseTo(DUJE_PRICE_SUM, 2);
    expect(sumPlannedCost(DUJE.milestones)).toBeNull();
  });

  it('Lucija: 1 od 9 faza ima cijenu', () => {
    expect(sumInvestorPrice(LUCIJA.milestones)).toBe(2900);
    expect(sumPlannedCost(LUCIJA.milestones)).toBeNull();
  });

  it('Solin: nijedna faza nema iznos', () => {
    expect(sumInvestorPrice(SOLIN.milestones)).toBeNull();
    expect(sumPlannedCost(SOLIN.milestones)).toBeNull();
  });
});

describe('planirana marža — samo faze s OBA iznosa', () => {
  it('Duje: nema nijedne faze s planiranim troškom → ništa se ne prikazuje', () => {
    expect(computeProjectPlannedMargin(DUJE.milestones)).toBeNull();
  });

  it('Lucija i Solin: isto — nema para trošak+cijena', () => {
    expect(computeProjectPlannedMargin(LUCIJA.milestones)).toBeNull();
    expect(computeProjectPlannedMargin(SOLIN.milestones)).toBeNull();
  });

  it('prazan trošak se NIKAD ne uzima kao nula', () => {
    const res = computeProjectPlannedMargin([
      { budget: 600, investor_price: 1000 },
      { budget: null, investor_price: 5020 }, // ispada iz zbroja
    ]);
    expect(res).not.toBeNull();
    expect(res!.plannedCost).toBe(600);
    expect(res!.plannedPrice).toBe(1000);
    expect(res!.plannedMarginAmount).toBe(400);
    expect(res!.plannedMarginPct).toBeCloseTo(40, 6);
    expect(res!.covered).toEqual({ withBoth: 1, total: 2 });
    expect(res!.partial).toBe(true);
  });

  it('skriveni iznos (uloga ga ne smije vidjeti → null) ispada iz zbroja', () => {
    const res = computeProjectPlannedMargin([
      { budget: 100, investor_price: 200 },
      { budget: 999, investor_price: null },
    ]);
    expect(res!.plannedPrice).toBe(200);
    expect(res!.plannedCost).toBe(100);
  });
});

describe('ZABRANA PRIBRAJANJA — ugovoreno i zbroj faza se nikad ne zbrajaju', () => {
  const FORBIDDEN = 42333.52 + DUJE_PRICE_SUM; // 84.112,17

  it('nijedan izlaz za Duje nije 84.112,17', () => {
    const outputs: number[] = [];
    const baseline = getCostBaseline(DUJE.project, DUJE.milestones);
    outputs.push(baseline.value);

    const summary = getBaselineSummary(DUJE.project, DUJE.spent, DUJE.milestones);
    outputs.push(summary.baseline.value, summary.remainderAmount ?? 0, summary.usedPct ?? 0);

    const note = computeContractPhaseNote(42333.52, DUJE.milestones);
    if (note?.kind === 'unclassified') {
      outputs.push(note.contractValue, note.phasesTotal, note.diff);
    }

    outputs.push(sumInvestorPrice(DUJE.milestones) ?? 0);

    for (const value of outputs) {
      expect(Math.abs(value - FORBIDDEN)).toBeGreaterThan(0.01);
    }
  });

  it('plannedPrice ne ovisi o contract_value — modul ga uopće ne prima', () => {
    // Ako netko ikad doda projekt kao argument i pribroji ugovoreno, arity puca.
    expect(computeProjectPlannedMargin.length).toBe(1);

    const milestones = [{ budget: 100, investor_price: 300 }];
    const a = computeProjectPlannedMargin(milestones)!;
    // Isti ulaz, projekt s deset puta većim ugovorenim iznosom — nema učinka,
    // jer ga funkcija nema odakle pročitati.
    const b = computeProjectPlannedMargin([...milestones])!;
    expect(a.plannedPrice).toBe(300);
    expect(b.plannedPrice).toBe(a.plannedPrice);
    expect(a.plannedMarginAmount).toBe(200);
  });

  it('napomena o nerazvrstanom je isključivo oduzimanje', () => {
    const duje = computeContractPhaseNote(42333.52, DUJE.milestones)!;
    expect(duje.kind).toBe('unclassified');
    if (duje.kind !== 'unclassified') throw new Error('unreachable');
    expect(duje.contractValue).toBeCloseTo(42333.52, 2);
    expect(duje.phasesTotal).toBeCloseTo(DUJE_PRICE_SUM, 2);
    expect(duje.diff).toBeCloseTo(554.87, 2);

    // Razlika radi u oba smjera: faze iznad ugovorenog daju negativan diff.
    const over = computeContractPhaseNote(1000, [{ budget: null, investor_price: 1500 }])!;
    expect(over.kind === 'unclassified' && over.diff).toBe(-500);
  });
});

describe('pokriće cijena po fazama — tvrdnja o nerazvrstanom samo kad je sve razvrstano', () => {
  it('Duje: 28 od 28 faza ima cijenu → potpuno pokriće', () => {
    const coverage = getPhasePriceCoverage(DUJE.milestones);
    expect(coverage).toEqual({ withPrice: 28, total: 28, full: true });
    const note = computeContractPhaseNote(42333.52, DUJE.milestones)!;
    expect(note.kind).toBe('unclassified');
    expect(note.coverage.full).toBe(true);
  });

  it('Lucija: 1 od 9 faza → razlika 26.800,00 se NE spominje', () => {
    const coverage = getPhasePriceCoverage(LUCIJA.milestones);
    expect(coverage).toEqual({ withPrice: 1, total: 9, full: false });

    const note = computeContractPhaseNote(29700, LUCIJA.milestones)!;
    expect(note.kind).toBe('partialCoverage');
    expect(note.coverage).toEqual({ withPrice: 1, total: 9, full: false });
    // Nigdje u napomeni nema iznosa — ni ugovorenog, ni zbroja, ni razlike.
    expect(JSON.stringify(note)).not.toContain('26800');
    expect(JSON.stringify(note)).not.toContain('29700');
    expect(JSON.stringify(note)).not.toContain('2900');
    expect('diff' in note).toBe(false);
  });

  it('jedna faza bez cijene ruši potpuno pokriće (granica je stroga)', () => {
    const almost = [
      { budget: null, investor_price: 1000 },
      { budget: null, investor_price: 1000 },
      { budget: null, investor_price: null },
    ];
    expect(getPhasePriceCoverage(almost).full).toBe(false);
    expect(computeContractPhaseNote(5000, almost)!.kind).toBe('partialCoverage');
  });

  it('Solin: nijedna faza nema cijenu → ništa se ne prikazuje', () => {
    expect(getPhasePriceCoverage(SOLIN.milestones)).toEqual({ withPrice: 0, total: 17, full: false });
    expect(computeContractPhaseNote(29700, SOLIN.milestones)).toBeNull();
  });

  it('Eda Zg: nema faza → ništa se ne prikazuje', () => {
    expect(getPhasePriceCoverage(EDA.milestones).full).toBe(false);
    expect(computeContractPhaseNote(1000, EDA.milestones)).toBeNull();
  });

  it('potpuno pokriće bez ugovorene vrijednosti → ništa (nema od čega oduzeti)', () => {
    expect(computeContractPhaseNote(null, DUJE.milestones)).toBeNull();
  });

  it('potpuno pokriće i razlika ≈ 0 → ništa', () => {
    expect(computeContractPhaseNote(1000, [{ budget: null, investor_price: 1000 }])).toBeNull();
  });
});

describe('osnovica za pragove', () => {
  it('planirani trošak faza ima prednost pred ugovorenim', () => {
    const baseline = getCostBaseline({ contract_value: 42333.52 }, [
      { budget: 10000, investor_price: 15000 },
      { budget: 5000, investor_price: null },
    ]);
    expect(baseline).toEqual({ value: 15000, source: 'planned_cost' });
  });

  it('Duje: bez planiranog troška osnovica je ugovoreno 42.333,52', () => {
    const baseline = getCostBaseline(DUJE.project, DUJE.milestones);
    expect(baseline.source).toBe('contract');
    expect(baseline.value).toBeCloseTo(42333.52, 2);
    // Ne total_budget (30.000) i ne zbroj faza.
    expect(baseline.value).not.toBe(30000);
    expect(baseline.value).not.toBeCloseTo(DUJE_PRICE_SUM, 2);
  });

  it('Solin: nema ni faza ni ugovorenog → nema osnovice ni pragova', () => {
    const summary = getBaselineSummary(SOLIN.project, SOLIN.spent, SOLIN.milestones);
    expect(summary.baseline.source).toBe('none');
    expect(summary.hasBaseline).toBe(false);
    expect(summary.remainderPct).toBeNull();
    expect(summary.level).toBe('neutral');
  });

  it('Eda Zg: fallback na total_budget preko calculateContractValue', () => {
    const baseline = getCostBaseline(EDA.project, EDA.milestones);
    expect(baseline).toEqual({ value: 1000, source: 'contract' });
  });
});

describe('pragovi — 80/100 nad planiranim troškom, 30/10 nad ugovorenim', () => {
  const planned = { value: 1000, source: 'planned_cost' as const };

  it('planirani trošak: <80 % zdravo, 80–100 % pažnja, >100 % kritično', () => {
    expect(getHealthLevel(799, planned)).toBe('healthy');
    expect(getHealthLevel(800, planned)).toBe('attention');
    expect(getHealthLevel(1000, planned)).toBe('attention');
    expect(getHealthLevel(1000.01, planned)).toBe('critical');
  });

  const contract = { value: 1000, source: 'contract' as const };

  it('ugovoreno: nepromijenjeno ponašanje otprije koraka F', () => {
    expect(getHealthLevel(700, contract)).toBe('healthy');
    expect(getHealthLevel(701, contract)).toBe('attention');
    expect(getHealthLevel(901, contract)).toBe('critical');
  });

  it('Duje: potrošeno 29.348,77 od 42.333,52 → preostalo 30,7 %, zdravo', () => {
    const summary = getBaselineSummary(DUJE.project, DUJE.spent, DUJE.milestones);
    expect(summary.remainderPct).toBeCloseTo(30.67, 1);
    expect(summary.remainderAmount).toBeCloseTo(12984.75, 2);
    expect(summary.level).toBe('healthy');
  });

  it('Lucija: potrošeno 10.660,14 od 29.700,00 → preostalo 64,1 %, zdravo', () => {
    const summary = getBaselineSummary(LUCIJA.project, LUCIJA.spent, LUCIJA.milestones);
    expect(summary.remainderPct).toBeCloseTo(64.11, 1);
    expect(summary.level).toBe('healthy');
  });
});

describe('natpisi i prateći tekstovi idu zajedno', () => {
  it('otvoren projekt: Preostalo / Neutrošeno', () => {
    const labels = getRemainderLabels('active');
    expect(labels.context).toBe('open');
    expect(labels.pct.fallback).toBe('Preostalo');
    expect(labels.amount.fallback).toBe('Neutrošeno');
  });

  it('završen projekt: Ostvarena marža / Zarada', () => {
    const labels = getRemainderLabels('completed');
    expect(labels.context).toBe('realized');
    expect(labels.pct.fallback).toBe('Ostvarena marža');
    expect(labels.amount.fallback).toBe('Zarada');
  });

  it('semafor nikad ne spominje maržu na otvorenom projektu', () => {
    for (const level of ['healthy', 'attention', 'critical'] as const) {
      const traffic = getRemainderTrafficLabel('active', level)!;
      expect(traffic.fallback.toLowerCase()).not.toContain('marž');
      // Ne smije tvrditi fiksni postotak — prag ovisi o osnovici.
      expect(traffic.fallback).not.toMatch(/\d/);
    }
  });

  it('semafor na završenom projektu smije govoriti o marži', () => {
    expect(getRemainderTrafficLabel('completed', 'healthy')!.fallback).toContain('marž');
    expect(getRemainderTrafficLabel('active', 'neutral')).toBeNull();
  });

  it('upozorenje postoji samo kad razina nije zdrava', () => {
    expect(getRemainderWarningLabel('active', 'healthy')).toBeNull();
    expect(getRemainderWarningLabel('active', 'neutral')).toBeNull();
    expect(getRemainderWarningLabel('active', 'critical')!.fallback).toContain('{{pct}}');
    expect(getRemainderWarningLabel('completed', 'attention')!.fallback).toContain('marž');
  });

  it('statusna riječ prati razinu', () => {
    expect(getRemainderStatusLabel('healthy').fallback).toBe('Zdrav');
    expect(getRemainderStatusLabel('attention').fallback).toBe('Pažnja');
    expect(getRemainderStatusLabel('critical').fallback).toBe('Kritično');
    expect(getRemainderStatusLabel('neutral').fallback).toBe('—');
  });
});
