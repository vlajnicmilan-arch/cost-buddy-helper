/**
 * Scope rules for the person payout screen.
 *
 * Safety cut: when the screen is opened from a project, only that project's
 * engagements are selected — the FIFO proposal never spills money onto other
 * projects. FIFO across everything applies only when opened without a project
 * (from People) or after an explicit "distribute to all".
 * Pure helpers — the FIFO rule itself stays in `personPayout.ts`.
 */
import {
  allocateFifo,
  payableObligations,
  round2,
  type Allocation,
  type EngagementObligation,
} from './personPayout';

/** Initial selection: the project's engagements, or every payable one. */
export function initialSelection(
  obligations: readonly EngagementObligation[],
  projectId: string | null | undefined,
): Set<string> {
  const payable = payableObligations(obligations);
  const rows = projectId ? payable.filter((o) => o.projectId === projectId) : payable;
  return new Set(rows.map((o) => o.engagementId));
}

/** Every payable engagement ("distribute to all"). */
export function selectAll(obligations: readonly EngagementObligation[]): Set<string> {
  return initialSelection(obligations, null);
}

export function selectedObligations(
  obligations: readonly EngagementObligation[],
  selected: ReadonlySet<string>,
): EngagementObligation[] {
  return obligations.filter((o) => selected.has(o.engagementId));
}

/** FIFO proposal limited to the selected engagements; others stay at 0. */
export function proposeScopedAllocation(
  obligations: readonly EngagementObligation[],
  selected: ReadonlySet<string>,
  amount: number,
): Allocation {
  return allocateFifo(selectedObligations(obligations, selected), amount);
}

export interface PayoutSummary {
  paying: number;
  earned: number;
  remaining: number;
}

/**
 * "Paying X · Earned Y · Left Z" for the selected engagements.
 * Left = what remains on them after this payout (never below 0).
 */
export function payoutSummary(
  obligations: readonly EngagementObligation[],
  selected: ReadonlySet<string>,
  earnedById: Readonly<Record<string, number>>,
  amount: number,
): PayoutSummary {
  const rows = selectedObligations(obligations, selected);
  const earned = round2(rows.reduce((s, o) => s + (earnedById[o.engagementId] ?? 0), 0));
  const owed = round2(rows.reduce((s, o) => s + o.remaining, 0));
  const paying = round2(Math.max(0, amount));
  return { paying, earned, remaining: round2(Math.max(0, owed - paying)) };
}
