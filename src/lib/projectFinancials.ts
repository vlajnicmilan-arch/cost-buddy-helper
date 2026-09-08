/**
 * JEDAN izvor financijskih brojki projekta.
 *
 * Popis projekata, početna, Pregled, Budžet i Financiranje moraju čitati
 * isti objekt. Prije ovoga svaki je ekran imao svoj nazivnik: popis budžet,
 * kartica na početnoj ugovoreno, tab Budžet zbroj faza. Isti projekt je
 * istovremeno pisao 0 %, 100 % i 97 %.
 *
 * Pravila (odluka rujan 2026):
 *  - `budget` je osnovica iz `getCostBaseline`: budžet projekta kad je > 0,
 *    inače zbroj planiranih troškova faza, inače ugovoreno.
 *  - „Preostalo" i postotak UVIJEK znače projektni budžet — nikad ugovoreno
 *    i nikad rezervu.
 *  - `contracted` zadržava postojeći fallback (contract_value → total_budget),
 *    ali tada `contractedIsEstimate` = true i marža se NE prikazuje.
 */
import {
  calculateProjectIncome,
  calculateProjectSpent,
  getContractValueInfo,
  type RawProjectExpense,
  type RawProjectForContract,
} from './projectCalculations';
import {
  getCostBaseline,
  getHealthLevel,
  type CostBaselineSource,
  type RemainderLevel,
} from './projectCostBaseline';
import { sumPlannedCost, type PlannedMarginMilestone } from './projectPlannedMargin';

export interface ProjectFinancialsInput {
  project: RawProjectForContract | null | undefined;
  milestones?: PlannedMarginMilestone[] | null;
  /** Transakcije projekta; izostavi kad prosljeđuješ već izračunate iznose. */
  expenses?: RawProjectExpense[] | null;
  /** Prednost pred `expenses` — za ekrane koji već imaju agregat. */
  spent?: number;
  received?: number;
}

export interface PhaseBudgetCoverage {
  /** Zbroj planiranih troškova faza. */
  phasesTotal: number;
  /** Osnovica s kojom se uspoređuje. */
  budget: number;
}

export interface ProjectFinancials {
  /** Ugovoreno s klijentom (uz fallback na budžet). */
  contracted: number;
  /** True kad je `contracted` zapravo budžet, a ne upisani ugovor. */
  contractedIsEstimate: boolean;
  /** Stvarno primljeno (income transakcije). */
  received: number;
  /** Stvarno potrošeno (expense transakcije, netirani predujmovi). */
  spent: number;
  /** Osnovica — budžet projekta / zbroj faza / ugovoreno. */
  budget: number;
  budgetSource: CostBaselineSource;
  hasBudget: boolean;
  /** budget − spent; `null` kad osnovice nema. */
  remainingBudget: number | null;
  /** Postotak potrošenog budžeta; `null` kad osnovice nema. */
  pctSpent: number | null;
  /** Preostalo u postotku budžeta; `null` kad osnovice nema. */
  pctRemaining: number | null;
  level: RemainderLevel;
  /**
   * Ostvarena marža = ugovoreno − potrošeno.
   * `null` kad ugovoreno nije upisano (procjena iz budžeta) ili je 0.
   */
  margin: number | null;
  marginPct: number | null;
  /**
   * Napomena o pokrivenosti: faze pokrivaju samo dio budžeta.
   * `null` kad faze nemaju planiranog troška ili pokrivaju cijeli budžet.
   */
  phaseBudgetCoverage: PhaseBudgetCoverage | null;
}

export function getProjectFinancials(input: ProjectFinancialsInput): ProjectFinancials {
  const { project, milestones, expenses } = input;
  const rows = Array.isArray(expenses) ? expenses : [];

  const spent = input.spent ?? calculateProjectSpent(rows);
  const received = input.received ?? calculateProjectIncome(rows);

  const contractInfo = getContractValueInfo(project);
  const baseline = getCostBaseline(project, milestones);
  const hasBudget = baseline.source !== 'none' && baseline.value > 0;

  const remainingBudget = hasBudget ? baseline.value - spent : null;
  const pctSpent = hasBudget ? (spent / baseline.value) * 100 : null;
  const pctRemaining = pctSpent === null ? null : 100 - pctSpent;

  const showMargin = !contractInfo.isEstimateFromBudget && contractInfo.value > 0;
  const margin = showMargin ? contractInfo.value - spent : null;
  const marginPct = margin === null ? null : (margin / contractInfo.value) * 100;

  const phasesTotal = sumPlannedCost(milestones);
  const phaseBudgetCoverage =
    hasBudget && phasesTotal !== null && phasesTotal > 0 && phasesTotal < baseline.value - 0.01
      ? { phasesTotal, budget: baseline.value }
      : null;

  return {
    contracted: contractInfo.value,
    contractedIsEstimate: contractInfo.isEstimateFromBudget,
    received,
    spent,
    budget: baseline.value,
    budgetSource: baseline.source,
    hasBudget,
    remainingBudget,
    pctSpent,
    pctRemaining,
    level: getHealthLevel(spent, baseline),
    margin,
    marginPct,
    phaseBudgetCoverage,
  };
}
