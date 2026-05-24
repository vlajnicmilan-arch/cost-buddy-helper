/**
 * Installment matching: poveži parsirani PDF red s `(n/m)` notacijom s
 * postojećim `installment_plans` + `installments` zapisom.
 *
 * Strategija:
 *  1) Filtriraj planove po type-u i približnom iznosu rate (total_amount / count ±0.1%).
 *  2) Među njima izaberi onaj s najsličnijim opisom (Levenshtein nad normaliziranim stringom).
 *  3) U planu nađi otvorenu (status='planned') ratu koja se poklapa po `installment_number`
 *     (kad PDF zna current/total) ili prvu sljedeću otvorenu.
 *
 * Pure helper — bez Supabase poziva. Pozivatelj radi DB UPDATE kad dobije rezultat.
 */

export interface InstallmentLike {
  id: string;
  plan_id: string;
  installment_number: number;
  amount: number;
  status: 'planned' | 'paid';
  expense_id?: string | null;
}

export interface InstallmentPlanLike {
  id: string;
  description: string;
  total_amount: number;
  installment_count: number;
  type: 'expense' | 'income';
  installments?: InstallmentLike[];
}

export interface ParsedInstallmentRow {
  base_description: string | null;
  description: string;
  amount: number;
  installment_current: number | null;
  installment_total: number | null;
  type: 'expense' | 'income' | 'transfer';
}

export interface InstallmentMatch {
  plan: InstallmentPlanLike;
  installment: InstallmentLike;
  score: number; // 0..1, više = bolje
}

const AMOUNT_TOLERANCE = 0.001; // 0.1%

export function normalizeDesc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(\s*\d+\s*\/\s*\d+\s*\)/g, '') // ukloni (n/m)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

function amountClose(a: number, b: number): boolean {
  if (a === 0 || b === 0) return a === b;
  const diff = Math.abs(a - b);
  return diff / Math.max(Math.abs(a), Math.abs(b)) <= AMOUNT_TOLERANCE;
}

/**
 * Vrati najbolji match (ili null) za jedan PDF red.
 * Minimalni prag sličnosti: 0.55 — ispod toga ne linkamo automatski.
 */
export function matchInstallmentToPlan(
  row: ParsedInstallmentRow,
  plans: InstallmentPlanLike[],
): InstallmentMatch | null {
  if (!plans.length) return null;

  const rowType = row.type === 'transfer' ? 'expense' : row.type;
  const rowDesc = normalizeDesc(row.base_description || row.description);
  if (!rowDesc) return null;

  let best: InstallmentMatch | null = null;

  for (const plan of plans) {
    if (plan.type !== rowType) continue;

    const expectedRate = plan.total_amount / Math.max(1, plan.installment_count);
    if (!amountClose(expectedRate, row.amount)) continue;

    // Ako PDF zna total broj rata, mora se poklapati s planom
    if (row.installment_total != null && row.installment_total !== plan.installment_count) continue;

    const sim = similarity(rowDesc, normalizeDesc(plan.description));
    if (sim < 0.55) continue;

    const open = (plan.installments || []).filter(i => i.status === 'planned' && !i.expense_id);
    if (open.length === 0) continue;

    let chosen: InstallmentLike | null = null;
    if (row.installment_current != null) {
      chosen = open.find(i => i.installment_number === row.installment_current) || null;
    }
    if (!chosen) {
      chosen = [...open].sort((a, b) => a.installment_number - b.installment_number)[0];
    }
    if (!chosen) continue;

    if (!best || sim > best.score) {
      best = { plan, installment: chosen, score: sim };
    }
  }

  return best;
}
