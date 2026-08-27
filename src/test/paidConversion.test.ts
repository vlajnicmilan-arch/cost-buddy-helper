import { describe, expect, it } from "vitest";
import { decidePaidConversion, recordPaidConversion } from "@/lib/paidConversion";

describe("decidePaidConversion", () => {
  it("logs on subscription.created with active status", () => {
    const d = decidePaidConversion({ eventType: "subscription.created", status: "active", hadPriorActiveEntitlement: false });
    expect(d.log).toBe(true);
  });

  it("logs on subscription.activated with active status", () => {
    const d = decidePaidConversion({ eventType: "subscription.activated", status: "active", hadPriorActiveEntitlement: false });
    expect(d.log).toBe(true);
  });

  it("does NOT log for a trial (status trialing)", () => {
    for (const et of ["subscription.created", "subscription.activated", "subscription.updated"]) {
      const d = decidePaidConversion({ eventType: et, status: "trialing", hadPriorActiveEntitlement: false });
      expect(d.log).toBe(false);
      expect(d.reason).toBe("status_not_active");
    }
  });

  it("logs on subscription.updated when transitioning into active (no prior active)", () => {
    const d = decidePaidConversion({ eventType: "subscription.updated", status: "active", hadPriorActiveEntitlement: false });
    expect(d.log).toBe(true);
    expect(d.reason).toBe("updated_transition_to_active");
  });

  it("does NOT log on renewal (subscription.updated, already active)", () => {
    const d = decidePaidConversion({ eventType: "subscription.updated", status: "active", hadPriorActiveEntitlement: true });
    expect(d.log).toBe(false);
    expect(d.reason).toBe("renewal_already_active");
  });

  it("does NOT log on cancellation / past_due / paused events", () => {
    for (const et of ["subscription.canceled", "subscription.past_due", "subscription.paused"]) {
      const d = decidePaidConversion({ eventType: et, status: "active", hadPriorActiveEntitlement: false });
      expect(d.log).toBe(false);
      expect(d.reason).toBe("unsupported_event");
    }
  });
});

function makeClient(result: { error: { code?: string; message: string } | null }) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        calls.push({ table, row });
        return result;
      },
    }),
  };
  return { client, calls };
}

describe("recordPaidConversion", () => {
  const base = { userId: "u1", subscriptionId: "sub_1", priceIds: ["pri_1"], eventType: "subscription.created" };

  it("inserts exactly one row with the right payload", async () => {
    const { client, calls } = makeClient({ error: null });
    const res = await recordPaidConversion(client, base);
    expect(res).toEqual({ ok: true, inserted: true });
    expect(calls).toHaveLength(1);
    const { table, row } = calls[0] as any;
    expect(table).toBe("funnel_events");
    expect(row.user_id).toBe("u1");
    expect(row.event_name).toBe("paid_conversion");
    expect(row.platform).toBe("webhook");
    expect(row.metadata).toEqual({
      provider: "paddle",
      subscription_id: "sub_1",
      price_ids: ["pri_1"],
      event_type: "subscription.created",
    });
  });

  it("treats 23505 (unique violation) as success without insert", async () => {
    const { client } = makeClient({ error: { code: "23505", message: "duplicate key" } });
    const res = await recordPaidConversion(client, base);
    expect(res).toEqual({ ok: true, inserted: false });
  });

  it("returns ok:false on other errors (caller logs and continues)", async () => {
    const { client } = makeClient({ error: { code: "42501", message: "rls denied" } });
    const res = await recordPaidConversion(client, base);
    expect(res.ok).toBe(false);
    expect(res).toEqual({ ok: false, error: "rls denied" });
  });
});
