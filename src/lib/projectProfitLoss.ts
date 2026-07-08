/**
 * Pure P&L computation for a project.
 * Extracted from useProjectProfitLoss so it can be unit-tested without Supabase.
 *
 * Dual view:
 *  - Cash view: actual income vs. actual costs (labor + collaborator paid + material)
 *  - Accrual view: expected profit against contract value (fallback to total_budget)
 *
 * Rules:
 *  - contract value falls back to total_budget when contract_value <= 0
 *  - material = max(0, expenses - labor - collaborator paid) so it never goes negative
 *  - labor cost = per-entry rate_at (historical) with fallback to worker.hourly_rate
 *    (delegated to computeProjectLaborCost). Legacy inputs without work_date /
 *    rateHistory keep working via the fallback path.
 *  - workers with 0 hours are omitted from worker details
 *  - collaborator cost uses paid_amount (cash basis)
 *  - margin / expectedMargin / collectedPercentage are 0 when denominator is 0
 *  - collectedPercentage is capped at 100
 *  - remainingToCollect is floored at 0
 */

import {
  computeProjectLaborCost,
  type LaborRateHistoryRow,
  type LaborWorkerDetail,
} from './projectLaborCost';

export interface PLProjectRow {
  contract_value?: number | string | null;
  total_budget?: number | string | null;
}

export interface PLTransactionRow {
  id?: string;
  type: string;
  amount: number | string | null;
  status?: string | null;
  expense_nature?: string | null;
  is_advance?: boolean | null;
  linked_advance_ids?: string[] | null;
}

export interface PLWorkEntryRow {
  worker_id: string;
  actual_hours: number | string | null;
  /**
   * ISO date string. Optional for backwards-compatibility with older callers
   * (tests without dates fall back to worker.hourly_rate, matching legacy behaviour).
   */
  work_date?: string | null;
}

export interface PLWorkerRow {
  id: string;
  first_name: string;
  last_name: string;
  hourly_rate: number | string | null;
}

export interface PLCollaboratorRow {
  id: string;
  first_name: string;
  last_name: string;
  total_price?: number | string | null;
  paid_amount?: number | string | null;
}

export type PLWorkerDetail = LaborWorkerDetail;

export interface PLCollaboratorDetail {
  id: string;
  name: string;
  totalPrice: number;
  paidAmount: number;
}

export interface PLInput {
  project: PLProjectRow | null | undefined;
  transactions: PLTransactionRow[] | null | undefined;
  workEntries: PLWorkEntryRow[] | null | undefined;
  workers: PLWorkerRow[] | null | undefined;
  collaborators: PLCollaboratorRow[] | null | undefined;
  /**
   * Optional per-day rate history. When absent, labor cost falls back to
   * worker.hourly_rate (legacy behaviour). Provide this from
   * useProjectProfitLoss for historically-accurate figures.
   */
  rateHistory?: LaborRateHistoryRow[] | null | undefined;
}

export interface PLResult {
  totalIncome: number;
  totalExpenses: number;
  laborCost: number;
  collaboratorCost: number;
  materialCost: number;
  netProfit: number;
  margin: number;
  workers: PLWorkerDetail[];
  collaborators: PLCollaboratorDetail[];
  contractValue: number;
  expectedProfit: number;
  expectedMargin: number;
  collectedPercentage: number;
  remainingToCollect: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const isCountedTx = (t: PLTransactionRow): boolean => {
  if (t.type === 'transfer') return false;
  if (t.expense_nature === 'correction') return false;
  if (t.status && t.status !== 'approved') return false;
  return true;
};

/**
 * Net amount of an expense after subtracting linked advances.
 * Mirrors calculateNetExpenseAmount in projectCalculations.ts (duplicated locally
 * so this helper has no cross-module dependency).
 */
const netExpenseAmount = (e: PLTransactionRow, all: PLTransactionRow[]): number => {
  const amount = num(e.amount);
  if (e.is_advance) {
    const linked = all.some(o =>
      !o.is_advance &&
      Array.isArray(o.linked_advance_ids) &&
      e.id != null &&
      o.linked_advance_ids.includes(e.id)
    );
    return linked ? 0 : amount;
  }
  const ids = e.linked_advance_ids || [];
  if (ids.length === 0) return amount;
  const sumLinked = ids.reduce((s, id) => {
    const a = all.find(o => o.id === id && o.is_advance);
    return a ? s + num(a.amount) : s;
  }, 0);
  return Math.max(amount - sumLinked, 0);
};

export const computeProjectProfitLoss = (input: PLInput): PLResult => {
  const cv = num(input.project?.contract_value);
  const contractValue = cv > 0 ? cv : num(input.project?.total_budget);

  const txs = input.transactions ?? [];
  let totalIncome = 0;
  let totalExpenses = 0;
  for (const t of txs) {
    if (!isCountedTx(t)) continue;
    if (t.type === 'income') totalIncome += num(t.amount);
    else if (t.type === 'expense') totalExpenses += netExpenseAmount(t, txs);
  }


  // Labor cost — per-day rate_at() with fallback to worker.hourly_rate.
  // Delegated to the shared helper so useProjectProfitLoss, MyWorkerPayCard,
  // and any future consumer produce identical numbers.
  const labor = computeProjectLaborCost({
    workers: input.workers ?? [],
    workEntries: (input.workEntries ?? []).map((e) => ({
      worker_id: e.worker_id,
      actual_hours: e.actual_hours,
      // Legacy callers without work_date get the fallback path (no history match).
      work_date: e.work_date ?? '',
    })),
    rateHistory: input.rateHistory ?? [],
  });
  const laborCost = labor.laborCost;
  const workerDetails: PLWorkerDetail[] = labor.workerDetails;


  let collaboratorCost = 0;
  const collabDetails: PLCollaboratorDetail[] = [];
  for (const c of input.collaborators ?? []) {
    const paid = num(c.paid_amount);
    collaboratorCost += paid;
    collabDetails.push({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      totalPrice: num(c.total_price),
      paidAmount: paid,
    });
  }

  const materialCost = Math.max(0, totalExpenses - laborCost - collaboratorCost);
  const totalCosts = laborCost + collaboratorCost + materialCost;
  const netProfit = totalIncome - totalCosts;
  const margin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

  const expectedProfit = contractValue - totalCosts;
  const expectedMargin = contractValue > 0 ? (expectedProfit / contractValue) * 100 : 0;
  const collectedPercentage =
    contractValue > 0 ? Math.min((totalIncome / contractValue) * 100, 100) : 0;
  const remainingToCollect = Math.max(contractValue - totalIncome, 0);

  return {
    totalIncome,
    totalExpenses,
    laborCost,
    collaboratorCost,
    materialCost,
    netProfit,
    margin,
    workers: workerDetails,
    collaborators: collabDetails,
    contractValue,
    expectedProfit,
    expectedMargin,
    collectedPercentage,
    remainingToCollect,
  };
};
