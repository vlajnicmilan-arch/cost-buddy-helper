import { describe, it, expect } from "vitest";
import { decideRefundAction } from "@/lib/paddleRefundDecision";

describe("decideRefundAction — Paddle refund semantics", () => {
  it("full refund + approved → revoke", () => {
    const d = decideRefundAction({
      action: "refund",
      status: "approved",
      type: "full",
      subscriptionId: "sub_123",
    });
    expect(d).toEqual({ kind: "revoke", subscriptionId: "sub_123" });
  });

  it("full refund but pending_approval → noop (do not revoke yet)", () => {
    const d = decideRefundAction({
      action: "refund",
      status: "pending_approval",
      type: "full",
      subscriptionId: "sub_123",
    });
    expect(d.kind).toBe("noop");
    if (d.kind === "noop") expect(d.reason).toBe("status_pending_approval");
  });

  it("partial refund + approved → noop with partial_refund_no_action", () => {
    const d = decideRefundAction({
      action: "refund",
      status: "approved",
      type: "partial",
      subscriptionId: "sub_123",
    });
    expect(d.kind).toBe("noop");
    if (d.kind === "noop") expect(d.reason).toBe("partial_refund_no_action");
  });

  it("rejected refund → noop", () => {
    const d = decideRefundAction({
      action: "refund",
      status: "rejected",
      type: "full",
      subscriptionId: "sub_123",
    });
    expect(d.kind).toBe("noop");
  });

  it("reversed refund → noop", () => {
    const d = decideRefundAction({
      action: "refund",
      status: "reversed",
      type: "full",
      subscriptionId: "sub_123",
    });
    expect(d.kind).toBe("noop");
  });

  it("credit adjustment (not refund) → noop", () => {
    const d = decideRefundAction({
      action: "credit",
      status: "approved",
      type: "full",
      subscriptionId: "sub_123",
    });
    expect(d.kind).toBe("noop");
    if (d.kind === "noop") expect(d.reason).toBe("action_credit");
  });

  it("missing subscription_id → noop", () => {
    const d = decideRefundAction({
      action: "refund",
      status: "approved",
      type: "full",
      subscriptionId: null,
    });
    expect(d.kind).toBe("noop");
    if (d.kind === "noop") expect(d.reason).toBe("no_subscription_id");
  });

  it("idempotency: same approved full refund evaluated twice → same revoke decision", () => {
    const input = {
      action: "refund",
      status: "approved",
      type: "full",
      subscriptionId: "sub_abc",
    };
    expect(decideRefundAction(input)).toEqual(decideRefundAction(input));
  });
});
