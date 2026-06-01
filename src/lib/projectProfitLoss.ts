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
 *  - labor cost = sum over workers of (sum of actual_hours) * hourly_rate (per-worker rates)
 *  - workers with 0 hours are omitted from worker details (but still in map)
 *  - collaborator cost uses paid_amount (cash basis)
 *  - margin / expectedMargin / collectedPercentage are 0 when denominator is 0
 *  - collectedPercentage is capped at 100
 *  - remainingToCollect is floored at 0
 */

export interface PLProjectRow {
  contract_value?: number | string | null;
  total_budget?: number | string | null;
}

export interface PLTransactionRow {
  type: string;
  amount: number | string | null;
}

export interface PLWorkEntryRow {
  worker_id: string;
  actual_hours: number | string | null;
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

export interface PLWorkerDetail {
  id: string;
  name: string;
  hours: number;
  rate: number;
  cost: number;
}

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

export const computeProjectProfitLoss = (input: PLInput): PLResult => {
  const cv = num(input.project?.contract_value);
  const contractValue = cv > 0 ? cv : num(input.project?.total_budget);

  let totalIncome = 0;
  let totalExpenses = 0;
  for (const t of input.transactions ?? []) {
    const amt = num(t.amount);
    if (t.type === 'income') totalIncome += amt;
    else if (t.type === 'expense') totalExpenses += amt;
  }

  const workerMap = new Map<string, { name: string; rate: number; hours: number }>();
  for (const w of input.workers ?? []) {
    workerMap.set(w.id, {
      name: `${w.first_name} ${w.last_name}`,
      rate: num(w.hourly_rate),
      hours: 0,
    });
  }
  for (const e of input.workEntries ?? []) {
    const w = workerMap.get(e.worker_id);
    if (w) w.hours += num(e.actual_hours);
  }

  let laborCost = 0;
  const workerDetails: PLWorkerDetail[] = [];
  workerMap.forEach((w, id) => {
    const cost = w.hours * w.rate;
    laborCost += cost;
    if (w.hours > 0) {
      workerDetails.push({ id, name: w.name, hours: w.hours, rate: w.rate, cost });
    }
  });

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
