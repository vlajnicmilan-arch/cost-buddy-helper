import { describe, it, expect } from "vitest";
import { decideSubscriptionState } from "@/lib/paddleCancelDecision";

const NOW = new Date("2026-08-01T12:00:00Z");
const future = (days: number) =>
  new Date(NOW.getTime() + days * 24 * 3600 * 1000).toISOString();
const past = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 3600 * 1000).toISOString();

describe("decideSubscriptionState — Paddle cancel semantics", () => {
  it("subscription.canceled with scheduled effective in the future → stays ACTIVE until that date", () => {
    const eff = future(15);
    const d = decideSubscriptionState({
      eventType: "subscription.canceled",
      status: "canceled",
      scheduledChange: { action: "cancel", effective_at: eff },
      canceledAt: NOW.toISOString(),
      periodEnd: eff,
      now: NOW,
    });
    expect(d.status).toBe("active");
    expect(d.scheduledCancelAt).toBe(eff);
  });

  it("subscription.canceled with only current_billing_period.ends_at in the future → stays ACTIVE until period_end", () => {
    const eff = future(20);
    const d = decideSubscriptionState({
      eventType: "subscription.canceled",
      status: "canceled",
      scheduledChange: null,
      canceledAt: NOW.toISOString(),
      periodEnd: eff,
      now: NOW,
    });
    expect(d.status).toBe("active");
    expect(d.scheduledCancelAt).toBe(eff);
  });

  it("subscription.canceled with immediate effect (period already ended, nothing scheduled) → CANCELED", () => {
    const d = decideSubscriptionState({
      eventType: "subscription.canceled",
      status: "canceled",
      scheduledChange: null,
      canceledAt: past(1),
      periodEnd: past(1),
      now: NOW,
    });
    expect(d.status).toBe("canceled");
    expect(d.scheduledCancelAt).toBeNull();
  });

  it("subscription.updated with scheduled_change.action='cancel' → still ACTIVE, records scheduled_cancel_at", () => {
    const eff = future(10);
    const d = decideSubscriptionState({
      eventType: "subscription.updated",
      status: "active",
      scheduledChange: { action: "cancel", effective_at: eff },
      canceledAt: null,
      periodEnd: eff,
      now: NOW,
    });
    expect(d.status).toBe("active");
    expect(d.scheduledCancelAt).toBe(eff);
  });

  it("subscription.updated without cancel scheduled → ACTIVE, no scheduled_cancel_at", () => {
    const d = decideSubscriptionState({
      eventType: "subscription.updated",
      status: "active",
      scheduledChange: null,
      canceledAt: null,
      periodEnd: future(30),
      now: NOW,
    });
    expect(d.status).toBe("active");
    expect(d.scheduledCancelAt).toBeNull();
  });

  it("subscription.past_due → status past_due passes through", () => {
    const d = decideSubscriptionState({
      eventType: "subscription.past_due",
      status: "past_due",
      scheduledChange: null,
      canceledAt: null,
      periodEnd: future(5),
      now: NOW,
    });
    expect(d.status).toBe("past_due");
  });

  it("subscription.paused → paused", () => {
    const d = decideSubscriptionState({
      eventType: "subscription.paused",
      status: "paused",
      scheduledChange: null,
      canceledAt: null,
      periodEnd: future(5),
      now: NOW,
    });
    expect(d.status).toBe("paused");
  });

  it("scheduled cancel whose effective date has passed → treat as immediate CANCELED", () => {
    const d = decideSubscriptionState({
      eventType: "subscription.canceled",
      status: "canceled",
      scheduledChange: { action: "cancel", effective_at: past(2) },
      canceledAt: past(2),
      periodEnd: past(2),
      now: NOW,
    });
    expect(d.status).toBe("canceled");
    expect(d.scheduledCancelAt).toBeNull();
  });
});
