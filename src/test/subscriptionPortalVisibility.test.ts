import { describe, it, expect } from "vitest";

// Mirrors the visibility rule in SubscriptionSection.tsx: the "Upravljaj
// pretplatom" button appears only when at least one active entitlement row
// has source='paddle'. Trial-only / admin-only / no-rows users must not see it.
type Row = { source: string };
const hasPaddle = (rows: Row[] | null | undefined) =>
  !!rows?.some((r) => r.source === "paddle");

describe("SubscriptionSection portal button visibility", () => {
  it("hidden when there are no active entitlements", () => {
    expect(hasPaddle([])).toBe(false);
    expect(hasPaddle(null)).toBe(false);
  });
  it("hidden for trial-only users", () => {
    expect(hasPaddle([{ source: "trial" }, { source: "trial" }])).toBe(false);
  });
  it("hidden for admin-granted-only users (no paid subscription to manage)", () => {
    expect(hasPaddle([{ source: "admin_grant" }])).toBe(false);
  });
  it("shown when at least one paddle row exists (even mixed with trial)", () => {
    expect(hasPaddle([{ source: "trial" }, { source: "paddle" }])).toBe(true);
  });
});
