/**
 * Pure decision helper for Paddle adjustment events (refunds / chargebacks).
 *
 * Milan policy (Aug 2026):
 *  - FULL refund in a FINAL approved state → revoke entitlements for that
 *    subscription immediately (status='revoked', period_end=now()).
 *  - PARTIAL refund → do nothing to entitlements; just log/record.
 *  - `pending_approval` / `rejected` / `reversed` → do nothing.
 *  - Any action other than 'refund' (e.g. 'credit', 'chargeback' handled
 *    separately by dispute events) → no action here.
 *
 * Paddle adjustment payload fields we rely on:
 *   data.action           'refund' | 'credit' | 'chargeback'
 *   data.status           'pending_approval' | 'approved' | 'rejected' | 'reversed'
 *   data.type             'full' | 'partial'   (whole transaction vs. subset)
 *   data.subscription_id  the sub that owned the refunded transaction
 */

export interface RefundDecisionInput {
  action?: string | null;
  status?: string | null;
  type?: string | null;
  subscriptionId?: string | null;
}

export type RefundDecision =
  | { kind: "revoke"; subscriptionId: string }
  | { kind: "noop"; reason: string };

export function decideRefundAction(input: RefundDecisionInput): RefundDecision {
  const action = (input.action ?? "").toLowerCase();
  if (action !== "refund") return { kind: "noop", reason: `action_${action || "unknown"}` };

  const status = (input.status ?? "").toLowerCase();
  // Only 'approved' is a final, money-moved state. 'pending_approval' is
  // Paddle's manual-review queue; 'rejected' / 'reversed' mean no money moved.
  if (status !== "approved") return { kind: "noop", reason: `status_${status || "unknown"}` };

  const type = (input.type ?? "").toLowerCase();
  if (type !== "full") return { kind: "noop", reason: "partial_refund_no_action" };

  const subId = input.subscriptionId;
  if (!subId) return { kind: "noop", reason: "no_subscription_id" };

  return { kind: "revoke", subscriptionId: subId };
}
