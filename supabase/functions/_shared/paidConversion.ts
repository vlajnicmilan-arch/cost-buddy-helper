/**
 * paidConversion — funnel writer for the FIRST paid Paddle conversion.
 *
 * Rules:
 *  - Only real paid activations count: Paddle subscription events whose
 *    status is "active". Trials ("trialing") never qualify. Admin-granted
 *    access never touches this path (it does not go through the webhook).
 *  - Renewals must NOT create a new event: for `subscription.updated` with
 *    an already-active status we skip if the subscription already had an
 *    active entitlement (i.e. it was active before this event).
 *  - Idempotency: unique index on funnel_events(user_id, event_name) makes
 *    duplicates impossible; code 23505 is treated as SUCCESS.
 *  - Best-effort: the caller wraps this in try/catch so a funnel failure
 *    can never break entitlement processing.
 *
 * Pure decision parts are exported for vitest; the insert takes a
 * supabase-like client so it can be unit-tested with a stub.
 */

export interface PaidConversionDecision {
  log: boolean;
  reason: string;
}

export function decidePaidConversion(params: {
  eventType: string;
  status: string | null | undefined;
  /** True if this subscription already had an active entitlement before this event. */
  hadPriorActiveEntitlement: boolean;
}): PaidConversionDecision {
  const { eventType, status, hadPriorActiveEntitlement } = params;
  if (status !== "active") {
    return { log: false, reason: "status_not_active" };
  }
  if (eventType === "subscription.created" || eventType === "subscription.activated") {
    return { log: true, reason: "activation_event" };
  }
  if (eventType === "subscription.updated") {
    // Transition INTO active (e.g. trial → paid) counts; a renewal of an
    // already-active subscription does not.
    return hadPriorActiveEntitlement
      ? { log: false, reason: "renewal_already_active" }
      : { log: true, reason: "updated_transition_to_active" };
  }
  return { log: false, reason: "unsupported_event" };
}

export interface FunnelInsertClient {
  from(table: string): {
    insert(row: Record<string, unknown>): Promise<{ error: { code?: string; message: string } | null }>;
  };
}

export type RecordResult =
  | { ok: true; inserted: boolean }
  | { ok: false; error: string };

export async function recordPaidConversion(
  client: FunnelInsertClient,
  params: {
    userId: string;
    subscriptionId: string;
    priceIds: string[];
    eventType: string;
  },
): Promise<RecordResult> {
  const { error } = await client.from("funnel_events").insert({
    user_id: params.userId,
    event_name: "paid_conversion",
    platform: "webhook",
    metadata: {
      provider: "paddle",
      subscription_id: params.subscriptionId,
      price_ids: params.priceIds,
      event_type: params.eventType,
    },
  });
  if (!error) return { ok: true, inserted: true };
  // 23505 = unique_violation on (user_id, event_name) → already logged, fine.
  if (error.code === "23505") return { ok: true, inserted: false };
  return { ok: false, error: error.message };
}
