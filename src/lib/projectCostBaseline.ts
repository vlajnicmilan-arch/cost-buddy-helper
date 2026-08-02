/**
 * Korak F — jedna osnovica za pragove, jedan semafor.
 *
 * Prije koraka F pragovi su bili rasuti na pet mjesta (kartica na dashboardu,
 * detalj projekta, ocjena zdravlja, detekcija problema, alarm zone gubitka),
 * svaki sa svojim brojem i svojim nazivnikom. Sada sva ta mjesta pitaju
 * `getCostBaseline` što je osnovica i `getHealthLevel` koja je razina.
 * Grananje `planned_cost` vs `contract` postoji SAMO unutar ove dvije funkcije.
 *
 * Prag ostaje 80/100 — mijenja se ono na što se odnosi:
 *   - `planned_cost` (Σ planiranog troška po fazama): žuto na 80 % planiranog
 *     troška, crveno preko 100 %.
 *   - `contract` (nema planiranog troška): današnje ponašanje, nepromijenjeno —
 *     žuto ispod 30 % preostalog, crveno ispod 10 %.
 *   - `none`: nema pragova, nema boje.
 */
import { calculateContractValue, type RawProjectForContract } from './projectCalculations';
import { sumPlannedCost, type PlannedMarginMilestone } from './projectPlannedMargin';

export type CostBaselineSource = 'planned_cost' | 'contract' | 'none';

export interface CostBaseline {
  /** Iznos osnovice; 0 kad je `source === 'none'`. */
  value: number;
  source: CostBaselineSource;
}

export type RemainderLevel = 'healthy' | 'attention' | 'critical' | 'neutral';

export function getCostBaseline(
  project: RawProjectForContract | null | undefined,
  milestones?: PlannedMarginMilestone[] | null,
): CostBaseline {
  const plannedCost = sumPlannedCost(milestones);
  if (plannedCost !== null && plannedCost > 0) {
    return { value: plannedCost, source: 'planned_cost' };
  }
  const contract = calculateContractValue(project);
  if (contract > 0) return { value: contract, source: 'contract' };
  return { value: 0, source: 'none' };
}

/** Postotak iskorištenosti osnovice; `null` kad osnovice nema. */
export function getBaselineUsedPct(
  spent: number,
  baseline: CostBaseline,
): number | null {
  if (baseline.source === 'none' || baseline.value <= 0) return null;
  return (spent / baseline.value) * 100;
}

/**
 * Preostalo u odnosu na osnovicu (osnovica − potrošeno).
 * `null` kad osnovice nema. Može biti negativno (prekoračenje).
 */
export function getRemainderAmount(
  spent: number,
  baseline: CostBaseline,
): number | null {
  if (baseline.source === 'none' || baseline.value <= 0) return null;
  return baseline.value - spent;
}

/** Preostalo u postotku osnovice; `null` kad osnovice nema. */
export function getRemainderPct(
  spent: number,
  baseline: CostBaseline,
): number | null {
  const used = getBaselineUsedPct(spent, baseline);
  if (used === null) return null;
  return 100 - used;
}

export function getHealthLevel(
  spent: number,
  baseline: CostBaseline,
): RemainderLevel {
  const used = getBaselineUsedPct(spent, baseline);
  if (used === null) return 'neutral';

  if (baseline.source === 'planned_cost') {
    if (used < 80) return 'healthy';
    if (used <= 100) return 'attention';
    return 'critical';
  }

  // `contract` — nepromijenjeni pragovi iz vremena prije koraka F.
  const remainingPct = 100 - used;
  if (remainingPct >= 30) return 'healthy';
  if (remainingPct >= 10) return 'attention';
  return 'critical';
}

/** Sažetak koji komponente troše kao jedan objekt. */
export interface BaselineSummary {
  baseline: CostBaseline;
  usedPct: number | null;
  remainderAmount: number | null;
  remainderPct: number | null;
  level: RemainderLevel;
  hasBaseline: boolean;
}

export function getBaselineSummary(
  project: RawProjectForContract | null | undefined,
  spent: number,
  milestones?: PlannedMarginMilestone[] | null,
): BaselineSummary {
  const baseline = getCostBaseline(project, milestones);
  return {
    baseline,
    usedPct: getBaselineUsedPct(spent, baseline),
    remainderAmount: getRemainderAmount(spent, baseline),
    remainderPct: getRemainderPct(spent, baseline),
    level: getHealthLevel(spent, baseline),
    hasBaseline: baseline.source !== 'none',
  };
}
