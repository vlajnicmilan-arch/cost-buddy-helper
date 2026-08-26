/**
 * Pure helpers for "Isplata s kartice čovjeka".
 *
 * The user types ONE amount; the app proposes a FIFO split across that
 * person's engagements (oldest unpaid work first). The proposal is editable,
 * but no engagement may ever receive more than what REMAINS on it — there is
 * no advance payment on this path.
 *
 * Money mechanics stay in the existing payout machinery (create_person_payout
 * -> create_worker_payout); this module only decides "how much on which
 * engagement".
 */

/** Underpaid part of one earlier payout — offered by name in the dialog. */
export interface ObligationShortfall {
  payoutId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  amount: number;
}

export interface EngagementObligation {
  /** project_workers.id */
  engagementId: string;
  projectId: string | null;
  hours: number;
  hourlyRate: number;
  /** Unpaid (still owed) amount on this engagement: earned − actually paid. */
  remaining: number;
  /** Underpaid parts of earlier payouts, oldest first (subset of `remaining`). */
  shortfalls?: ObligationShortfall[];
  /** Oldest / newest unpaid work date — the payout period. */
  unpaidFrom: string | null;
  unpaidTo: string | null;
}

export type Allocation = Record<string, number>;


export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Obligations with something left to pay, oldest unpaid work first. */
export function payableObligations(
  obligations: readonly EngagementObligation[],
): EngagementObligation[] {
  return obligations
    .filter((o) => o.remaining > 0.005 && o.unpaidFrom && o.unpaidTo)
    .sort((a, b) => {
      const af = a.unpaidFrom ?? '9999-12-31';
      const bf = b.unpaidFrom ?? '9999-12-31';
      return af.localeCompare(bf) || a.engagementId.localeCompare(b.engagementId);
    });
}

/** Total still owed across the person's engagements. */
export function totalRemaining(obligations: readonly EngagementObligation[]): number {
  return round2(payableObligations(obligations).reduce((s, o) => s + o.remaining, 0));
}

/**
 * FIFO proposal: fill the oldest obligation fully, then the next one.
 * Never proposes more than each engagement's remaining amount.
 */
export function allocateFifo(
  obligations: readonly EngagementObligation[],
  amount: number,
): Allocation {
  const out: Allocation = {};
  let left = round2(Math.max(0, amount));
  for (const o of payableObligations(obligations)) {
    if (left <= 0.005) break;
    const take = round2(Math.min(left, round2(o.remaining)));
    if (take > 0) {
      out[o.engagementId] = take;
      left = round2(left - take);
    }
  }
  return out;
}

export interface AllocationValidation {
  ok: boolean;
  /** Sum of the current allocation. */
  allocated: number;
  /** amount - allocated (0 when the split matches the typed amount). */
  unallocated: number;
  /** Engagements where the entered value exceeds what remains. */
  overAllocated: string[];
  /** true when the typed amount is larger than everything that remains. */
  exceedsTotal: boolean;
}

export function validateAllocation(
  obligations: readonly EngagementObligation[],
  allocation: Allocation,
  amount: number,
): AllocationValidation {
  const byId = new Map(obligations.map((o) => [o.engagementId, o]));
  const overAllocated: string[] = [];
  let allocated = 0;

  for (const [id, value] of Object.entries(allocation)) {
    const v = Number(value) || 0;
    if (v <= 0) continue;
    allocated = round2(allocated + v);
    const o = byId.get(id);
    if (!o || v > round2(o.remaining) + 0.01) overAllocated.push(id);
  }

  const total = totalRemaining(obligations);
  const amt = round2(amount);
  const exceedsTotal = amt > total + 0.01;

  return {
    ok: amt > 0 && !exceedsTotal && overAllocated.length === 0 && Math.abs(amt - allocated) < 0.01,
    allocated,
    unallocated: round2(amt - allocated),
    overAllocated,
    exceedsTotal,
  };
}

export interface PersonPayoutRpcItem {
  project_id: string;
  worker_id: string;
  period_start: string;
  period_end: string;
  paid_amount: number;
}

export interface BuildPersonPayoutArgsInput {
  obligations: readonly EngagementObligation[];
  allocation: Allocation;
  paymentSource: string;
  paidAt: string;
  note?: string | null;
  lockEntries?: boolean;
}

/**
 * Maps the editable allocation to `public.create_person_payout` arguments.
 * Only engagements with a positive amount take part.
 */
export function buildPersonPayoutRpcArgs(input: BuildPersonPayoutArgsInput) {
  const items: PersonPayoutRpcItem[] = [];
  for (const o of payableObligations(input.obligations)) {
    const amount = round2(Number(input.allocation[o.engagementId]) || 0);
    if (amount <= 0) continue;
    if (!o.projectId || !o.unpaidFrom || !o.unpaidTo) continue;
    items.push({
      project_id: o.projectId,
      worker_id: o.engagementId,
      period_start: o.unpaidFrom,
      period_end: o.unpaidTo,
      paid_amount: amount,
    });
  }
  return {
    p_items: items,
    p_payment_source: input.paymentSource,
    p_paid_at: input.paidAt,
    p_note: input.note ?? null,
    p_lock_entries: input.lockEntries ?? true,
  };
}
