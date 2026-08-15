/**
 * Pure issue detectors. No I/O — input data in, IssueCandidate[] out.
 * Used by useIssueReconciler to upsert/auto-resolve rows in `notifications`
 * (active-issue lifecycle).
 *
 * Each detector returns a stable `dedup_key` so the reconciler can
 * upsert by `(user_id, dedup_key)` and auto-resolve when a problem
 * is no longer detected.
 */

export type IssueSeverity = "info" | "warning" | "critical";

export type IssueType =
  | "project_loss_zone"
  | "overdue_invoice"
  | "overdue_incoming_invoice"
  | "budget_burn"
  | "cashflow_risk";

export interface IssueCandidate {
  type: IssueType;
  dedup_key: string;
  severity: IssueSeverity;
  /** i18n key for title */
  title_key: string;
  /** Vars for title interpolation */
  title_vars?: Record<string, string | number>;
  /** i18n key for message */
  message_key: string;
  message_vars?: Record<string, string | number>;
  entity_type?: "project" | "invoice" | "budget";
  entity_id?: string;
  data?: Record<string, unknown>;
}

// ============================================================
// 1. Project loss zone — razina 'critical' iz getHealthLevel nad osnovicom
// (planirani trošak faza kad postoji, inače ugovoreno).
// ============================================================

import { getBaselineSummary } from "./projectCostBaseline";
import type { PlannedMarginMilestone } from "./projectPlannedMargin";

interface ProjectInput {
  id: string;
  name: string;
  contract_value?: number | null;
  total_budget?: number;
  status?: string;
  /** Faze projekta kad su dostupne — daju planirani trošak kao osnovicu. */
  milestones?: PlannedMarginMilestone[] | null;
}

interface ExpenseInput {
  project_id?: string | null;
  amount: number;
  type: string;
  expense_nature?: string | null;
}

export const detectProjectLossZone = (
  projects: ProjectInput[],
  expenses: ExpenseInput[],
): IssueCandidate[] => {
  if (!projects?.length) return [];

  const spentByProject = new Map<string, number>();
  for (const e of expenses) {
    if (!e.project_id) continue;
    if (e.type !== "expense") continue;
    if (e.expense_nature === "correction") continue;
    spentByProject.set(e.project_id, (spentByProject.get(e.project_id) ?? 0) + (Number(e.amount) || 0));
  }

  const out: IssueCandidate[] = [];
  for (const p of projects) {
    if (p.status === "completed" || p.status === "cancelled") continue;
    const spent = spentByProject.get(p.id) ?? 0;
    const summary = getBaselineSummary(p, spent, p.milestones);
    if (!summary.hasBaseline) continue;
    if (summary.level !== "critical") continue;
    const contract = summary.baseline.value;
    const marginPct = summary.remainderPct ?? 0;

    const severity: IssueSeverity = marginPct < 0 ? "critical" : "warning";
    out.push({
      type: "project_loss_zone",
      dedup_key: `project_loss_zone:${p.id}`,
      severity,
      title_key: "attention.issues.lossZone.title",
      title_vars: { projectName: p.name },
      message_key: marginPct < 0
        ? "attention.issues.lossZone.messageOver"
        : "attention.issues.lossZone.message",
      message_vars: { marginPct: Number(marginPct.toFixed(1)) },
      entity_type: "project",
      entity_id: p.id,
      data: { project_id: p.id, project_name: p.name, margin_pct: Number(marginPct.toFixed(1)), contract_value: contract, spent },
    });
  }
  return out;
};

// ============================================================
// 2. Overdue invoice — days_overdue > 7
// ============================================================

interface OverdueInvoiceInput {
  id: string;
  invoice_number?: string | null;
  daysOverdue: number;
  remaining: number;
  project_id?: string | null;
}

export const detectOverdueInvoices = (
  unpaid: OverdueInvoiceInput[],
): IssueCandidate[] => {
  const out: IssueCandidate[] = [];
  for (const inv of unpaid) {
    if (inv.daysOverdue <= 7) continue;
    if (inv.remaining <= 0) continue;
    const severity: IssueSeverity = inv.daysOverdue > 30 ? "critical" : "warning";
    out.push({
      type: "overdue_invoice",
      dedup_key: `overdue_invoice:${inv.id}`,
      severity,
      title_key: "attention.issues.overdueInvoice.title",
      title_vars: { invoiceNumber: inv.invoice_number || "—" },
      message_key: "attention.issues.overdueInvoice.message",
      message_vars: {
        daysOverdue: inv.daysOverdue,
        amount: inv.remaining.toFixed(2),
      },
      entity_type: "invoice",
      entity_id: inv.id,
      data: {
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        days_overdue: inv.daysOverdue,
        remaining: inv.remaining,
        project_id: inv.project_id,
      },
    });
  }
  return out;
};

// ============================================================
// 3. Budget burn — spent > 85% of planned
// ============================================================

interface BudgetInput {
  id: string;
  name: string;
  /** Planned/allocated amount for the active period */
  planned: number;
  /** Actually spent in the active period */
  spent: number;
}

export const detectBudgetBurn = (budgets: BudgetInput[]): IssueCandidate[] => {
  const out: IssueCandidate[] = [];
  for (const b of budgets) {
    if (!b.planned || b.planned <= 0) continue;
    const pct = (b.spent / b.planned) * 100;
    if (pct < 85) continue;
    const severity: IssueSeverity = pct >= 100 ? "critical" : "warning";
    const spentPct = Math.round(pct);
    out.push({
      type: "budget_burn",
      dedup_key: `budget_burn:${b.id}`,
      severity,
      title_key: "attention.issues.budgetBurn.title",
      // Title template references BOTH {{spentPct}} and {{budgetName}} —
      // vars must include every placeholder used in title/message.
      title_vars: { budgetName: b.name, spentPct },
      message_key: pct >= 100
        ? "attention.issues.budgetBurn.messageOver"
        : "attention.issues.budgetBurn.message",
      message_vars: { spentPct, budgetName: b.name },
      entity_type: "budget",
      entity_id: b.id,
      data: { budget_id: b.id, budget_name: b.name, spent_pct: spentPct, planned: b.planned, spent: b.spent },
    });
  }
  return out;
};

// ============================================================
// 4. Cashflow risk — projected balance over horizon < 0
// ============================================================

interface CashflowInput {
  currentBalance: number;
  /** Sum of expected outflows (recurring + installments) over horizon */
  expectedOutflow: number;
  /** Sum of expected inflows over horizon */
  expectedInflow: number;
  /** Horizon in days (default 30) */
  horizonDays?: number;
}

export const detectCashflowRisk = (input: CashflowInput): IssueCandidate[] => {
  const horizon = input.horizonDays ?? 30;
  const projected = input.currentBalance + input.expectedInflow - input.expectedOutflow;
  if (projected >= 0) return [];
  const shortage = Math.abs(projected);
  return [{
    type: "cashflow_risk",
    dedup_key: `cashflow_risk:${horizon}d`,
    severity: "warning",
    title_key: "attention.issues.cashflowRisk.title",
    message_key: "attention.issues.cashflowRisk.message",
    message_vars: { daysAhead: horizon, shortage: shortage.toFixed(2) },
    data: {
      horizon_days: horizon,
      shortage,
      current_balance: input.currentBalance,
      expected_inflow: input.expectedInflow,
      expected_outflow: input.expectedOutflow,
    },
  }];
};

// ============================================================
// Reconciler (pure) — diff between current active and detected
// ============================================================

export interface ActiveIssueRow {
  id: string;
  type: string;
  dedup_key: string;
}

export interface ReconcileResult {
  /** Issues that should be inserted/refreshed in DB (always upsert). */
  toUpsert: IssueCandidate[];
  /**
   * For each detector type present in `detected`, the list of dedup_keys that
   * should remain active. Reconciler resolves any active row with that type
   * NOT in this set.
   */
  resolveScopes: Array<{ type: IssueType; activeDedupKeys: string[] }>;
}

export const reconcileIssues = (
  detectedByType: Partial<Record<IssueType, IssueCandidate[]>>,
): ReconcileResult => {
  const toUpsert: IssueCandidate[] = [];
  const resolveScopes: ReconcileResult["resolveScopes"] = [];

  for (const type of Object.keys(detectedByType) as IssueType[]) {
    const list = detectedByType[type] ?? [];
    toUpsert.push(...list);
    resolveScopes.push({
      type,
      activeDedupKeys: list.map(i => i.dedup_key),
    });
  }
  return { toUpsert, resolveScopes };
};

// ============================================================
// 5. Overdue INCOMING invoices (ulazni računi) — AGREGAT, ne po računu
//
// Prekoračeno dospijeće ulaznog računa je STANJE, ne događaj: nikakvo
// dnevno zvocanje ni push. Jedna stavka u "Za pažnju" koja se sama gasi
// (resolve_stale_issues) kad prekoračenih računa više nema.
// ============================================================

export interface OverdueIncomingInvoiceInput {
  id: string;
  due_date: string | null;
  paid_at?: string | null;
  total_amount: number | string;
  /** `in` = obveza (dugujem). Izlazni (`out`) NIJE obveza i ne ulazi u agregat. */
  direction?: string | null;
  /** null = osobne knjige; inače poslovni profil korisnika. */
  business_profile_id?: string | null;
}

export interface OverdueBreakdownEntry {
  business_profile_id: string | null;
  label: string;
  count: number;
  total: number;
}

/**
 * PRAVILO „PREKORAČENA OBVEZA":
 *   direction = 'in' (ulazni račun = obveza)
 *   AND paid_at IS NULL
 *   AND due_date < današnji datum
 *   preko SVIH korisnikovih knjiga (osobno + svi poslovni profili).
 *
 * Izlazni računi (`direction = 'out'`, potraživanja) NISU obveza i namjerno
 * nisu u zbroju — razlika prema sirovom `count(*)` nad tablicom.
 */
export const detectOverdueIncomingInvoices = (
  invoices: OverdueIncomingInvoiceInput[],
  today: Date = new Date(),
  profileLabels: Record<string, string> = {},
  personalLabel = "osobno",
): IssueCandidate[] => {
  const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  let count = 0;
  let total = 0;
  const byProfile = new Map<string, { count: number; total: number }>();
  for (const inv of invoices ?? []) {
    if (inv.paid_at) continue;
    if (!inv.due_date) continue;
    if ((inv.direction ?? "in") !== "in") continue;
    const due = new Date(`${inv.due_date.slice(0, 10)}T00:00:00Z`).getTime();
    if (Number.isNaN(due) || due >= base) continue;
    const amount = Number(inv.total_amount);
    const abs = Number.isFinite(amount) ? Math.abs(amount) : 0;
    count += 1;
    total += abs;
    const key = inv.business_profile_id ?? "";
    const bucket = byProfile.get(key) ?? { count: 0, total: 0 };
    bucket.count += 1;
    bucket.total += abs;
    byProfile.set(key, bucket);
  }
  if (count === 0) return [];

  const entries: OverdueBreakdownEntry[] = [...byProfile.entries()]
    .map(([key, v]) => ({
      business_profile_id: key === "" ? null : key,
      label: key === "" ? personalLabel : (profileLabels[key] ?? key),
      count: v.count,
      total: Number(v.total.toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  // Razrada se prikazuje samo kad knjige nisu jedne jedine — korisnik s dva
  // profila ne smije dobiti jedan mutni zbroj.
  const breakdown = entries.length > 1
    ? entries.map(e => `${e.label} ${e.count}`).join(" · ")
    : "";

  return [{
    type: "overdue_incoming_invoice",
    dedup_key: "overdue_incoming_invoices",
    severity: "warning",
    title_key: "attention.issues.overdueIncomingInvoices.title",
    title_vars: { count },
    message_key: breakdown
      ? "attention.issues.overdueIncomingInvoices.messageWithBreakdown"
      : "attention.issues.overdueIncomingInvoices.message",
    message_vars: breakdown
      ? { count, amount: `${total.toFixed(2)} €`, breakdown }
      : { count, amount: `${total.toFixed(2)} €` },
    data: {
      count,
      total: Number(total.toFixed(2)),
      by_profile: entries,
      breakdown,
      // Meta klika: postojeći routing mehanizam čita `route`.
      route: "/home?eracun=overdue",
      target: "eracun_overdue",
    },
  }];
};

