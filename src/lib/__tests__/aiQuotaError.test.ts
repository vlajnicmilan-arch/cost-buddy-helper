import { describe, it, expect } from "vitest";
import { parseAiQuotaError } from "../aiQuotaError";

function makeResp(status: number, body?: unknown) {
  return {
    status,
    json: async () => {
      if (body === undefined) throw new Error("no body");
      return body;
    },
  };
}

describe("parseAiQuotaError", () => {
  it("returns null for non-429 responses", async () => {
    expect(await parseAiQuotaError(makeResp(200, { ok: true }))).toBeNull();
    expect(await parseAiQuotaError(makeResp(500))).toBeNull();
  });

  it("recognises daily_ai_limit_reached payload", async () => {
    const result = await parseAiQuotaError(
      makeResp(429, {
        error: "daily_ai_limit_reached",
        route: "parse-receipt",
        limit: 10,
        tier: "free",
      }),
    );
    expect(result).toEqual({
      kind: "daily_limit",
      limit: 10,
      tier: "free",
      route: "parse-receipt",
    });
  });

  it("recognises core_scan_limit_reached payload", async () => {
    const result = await parseAiQuotaError(
      makeResp(429, {
        error: "core_scan_limit_reached",
        remaining: 0,
        reset_at: "2026-07-02T00:00:00Z",
      }),
    );
    expect(result).toEqual({
      kind: "core_scan_limit",
      resetAt: "2026-07-02T00:00:00Z",
    });
  });

  it("falls back to rate_limit for other 429 bodies", async () => {
    expect(
      await parseAiQuotaError(makeResp(429, { error: "too_many_requests" })),
    ).toEqual({ kind: "rate_limit" });
    expect(await parseAiQuotaError(makeResp(429))).toEqual({
      kind: "rate_limit",
    });
  });
});
