/**
 * Korak F — planirana marža projekta (zbroj po fazama).
 *
 * Ulaz su ISKLJUČIVO faze. Modul namjerno NEMA pristup projektu:
 * ugovorena vrijednost (`contract_value`) je knjiga (osnovica + aneksi), a
 * zbroj cijena po fazama je snimka. Njih dvoje se nikad ne zbrajaju i nikad
 * ne ulaze u isti izračun — pribrajanje bi bilo dvostruko brojanje aneksa.
 *
 * Pravilo zbrajanja: računa se SAMO faza koja ima OBA iznosa
 * (`budget` i `investor_price`). Prazan trošak se nikad ne uzima kao 0 —
 * to bi tvrdilo „ova faza je čista zarada" i uvijek napuhalo maržu.
 * Skriveni iznos (uloga ga ne smije vidjeti) dolazi kao `null` iz pogleda
 * `project_milestones_scoped` i ispada iz zbroja istim putem.
 */

export interface PlannedMarginMilestone {
  budget?: number | null;
  investor_price?: number | null;
}

export interface PlannedMarginResult {
  /** Zbroj planiranog troška faza koje imaju oba iznosa. */
  plannedCost: number;
  /** Zbroj cijena prema investitoru faza koje imaju oba iznosa. */
  plannedPrice: number;
  /** plannedPrice − plannedCost */
  plannedMarginAmount: number;
  /** Postotak; `null` kad je plannedPrice <= 0 (nema dijeljenja s nulom). */
  plannedMarginPct: number | null;
  /** Pokriće: koliko faza ima oba iznosa od ukupnog broja faza. */
  covered: { withBoth: number; total: number };
  /** True kad pokriće nije potpuno — UI iznad brojke pokazuje napomenu. */
  partial: boolean;
}

const isRealNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/**
 * Vraća `null` kad nijedna faza nema oba iznosa — tada se ništa ne prikazuje.
 * Nikad ne vraća 0 % iz nedostatka podataka.
 */
export function computeProjectPlannedMargin(
  milestones: PlannedMarginMilestone[] | null | undefined,
): PlannedMarginResult | null {
  const list = Array.isArray(milestones) ? milestones : [];
  const total = list.length;

  let plannedCost = 0;
  let plannedPrice = 0;
  let withBoth = 0;

  for (const m of list) {
    const cost = m?.budget;
    const price = m?.investor_price;
    if (!isRealNumber(cost) || !isRealNumber(price)) continue;
    plannedCost += cost;
    plannedPrice += price;
    withBoth += 1;
  }

  if (withBoth === 0) return null;

  const plannedMarginAmount = plannedPrice - plannedCost;
  const plannedMarginPct =
    plannedPrice > 0 ? (plannedMarginAmount / plannedPrice) * 100 : null;

  return {
    plannedCost,
    plannedPrice,
    plannedMarginAmount,
    plannedMarginPct,
    covered: { withBoth, total },
    partial: withBoth < total,
  };
}

/**
 * Zbroj planiranog troška po fazama (nezavisno o tome ima li faza cijenu).
 * Koristi ga `getCostBaseline` kao osnovicu za pragove.
 * `null` kad nijedna faza nema upisan trošak.
 */
export function sumPlannedCost(
  milestones: PlannedMarginMilestone[] | null | undefined,
): number | null {
  const list = Array.isArray(milestones) ? milestones : [];
  let sum = 0;
  let found = 0;
  for (const m of list) {
    if (!isRealNumber(m?.budget)) continue;
    sum += m.budget as number;
    found += 1;
  }
  return found > 0 ? sum : null;
}

/** Zbroj cijena prema investitoru po fazama. `null` kad ih nema. */
export function sumInvestorPrice(
  milestones: PlannedMarginMilestone[] | null | undefined,
): number | null {
  const list = Array.isArray(milestones) ? milestones : [];
  let sum = 0;
  let found = 0;
  for (const m of list) {
    if (!isRealNumber(m?.investor_price)) continue;
    sum += m.investor_price as number;
    found += 1;
  }
  return found > 0 ? sum : null;
}

export interface UnclassifiedContract {
  contractValue: number;
  phasesTotal: number;
  /** contractValue − phasesTotal; može biti negativan. */
  diff: number;
}

/**
 * Napomena o nerazvrstanom iznosu — ČISTI PRIKAZ.
 * Jedina točka u kojoj se ugovorena vrijednost i zbroj faza pojavljuju
 * zajedno, i to isključivo kao oduzimanje. Nikad zbrajanje.
 *
 * `null` kad nema nijedne faze s cijenom ili kad je razlika zanemariva.
 */
export function computeUnclassifiedContract(
  contractValue: number | null | undefined,
  milestones: PlannedMarginMilestone[] | null | undefined,
): UnclassifiedContract | null {
  const contract = Number(contractValue || 0);
  if (!Number.isFinite(contract) || contract <= 0) return null;
  const phasesTotal = sumInvestorPrice(milestones);
  if (phasesTotal === null) return null;
  const diff = contract - phasesTotal;
  if (Math.abs(diff) <= 0.01) return null;
  return { contractValue: contract, phasesTotal, diff };
}
