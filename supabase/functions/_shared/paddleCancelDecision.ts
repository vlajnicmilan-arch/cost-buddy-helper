/**
 * Pure decision helper for Paddle subscription cancel/update events.
 *
 * Rules (Milan, Aug 2026):
 *  - `subscription.canceled` with an effective date in the FUTURE
 *    (scheduled_change.effective_at OR current_billing_period.ends_at)
 *    → keep entitlement `active` until that date; record `scheduled_cancel_at`.
 *  - `subscription.canceled` with immediate effect (no future date, or
 *    canceled_at already in the past) → status becomes `canceled` right away.
 *  - `subscription.updated` with `scheduled_change.action = 'cancel'`
 *    → keep whatever the natural status is (usually active) and record
 *    `scheduled_cancel_at`. Do NOT downgrade to canceled.
 *  - `past_due` / `paused` map straight through; still record any
 *    scheduled cancel that came with the payload.
 */

export type EntitlementStatus = "active" | "canceled" | "past_due" | "paused";

export interface CancelDecisionInput {
  eventType: string;
  status?: string | null;
  scheduledChange?: { action?: string; effective_at?: string } | null;
  canceledAt?: string | null;
  periodEnd?: string | null;
  now: Date;
}

export interface CancelDecision {
  status: EntitlementStatus;
  scheduledCancelAt: string | null;
}

export function decideSubscriptionState(input: CancelDecisionInput): CancelDecision {
  const nowMs = input.now.getTime();
  const raw = (input.status ?? "").toLowerCase();

  const scheduledCancelIso =
    input.scheduledChange?.action === "cancel"
      ? input.scheduledChange?.effective_at ?? null
      : null;
  const scheduledMs = scheduledCancelIso ? new Date(scheduledCancelIso).getTime() : NaN;
  const periodEndMs = input.periodEnd ? new Date(input.periodEnd).getTime() : NaN;
  const canceledAtMs = input.canceledAt ? new Date(input.canceledAt).getTime() : NaN;

  const isCancelEvent = input.eventType === "subscription.canceled" || raw === "canceled";

  if (isCancelEvent) {
    // Future scheduled or period still runs → active until then.
    const futureScheduled = Number.isFinite(scheduledMs) && scheduledMs > nowMs;
    const futurePeriod = Number.isFinite(periodEndMs) && periodEndMs > nowMs;
    if (futureScheduled || futurePeriod) {
      const iso = futureScheduled
        ? scheduledCancelIso!
        : (input.periodEnd as string);
      return { status: "active", scheduledCancelAt: iso };
    }
    // Immediate cancel: canceled_at present in past OR nothing future known.
    // (Also handles legacy immediate-cancel payloads.)
    void canceledAtMs;
    return { status: "canceled", scheduledCancelAt: null };
  }

  if (raw === "past_due") {
    return { status: "past_due", scheduledCancelAt: scheduledCancelIso };
  }
  if (raw === "paused") {
    return { status: "paused", scheduledCancelAt: scheduledCancelIso };
  }
  return { status: "active", scheduledCancelAt: scheduledCancelIso };
}
