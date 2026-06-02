import { describe, it, expect } from "vitest";
import { parseAiQuotaError } from "../aiQuotaError";

function makeResponse(status: number, body?: unknown): Response {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("parseAiQuotaError", () => {
  it("returns null for non-429 responses", async () => {
    expect(await parseAiQuotaError(makeResponse(200, { ok: true }))).toBeNull();
    expect(await parseAiQuotaError(makeResponse(500))).toBeNull();
  });

  it("recognises daily_ai_limit_reached payload", async () => {
    const result = await parseAiQuotaError(
      makeResponse(429, {
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

  it("falls back to rate_limit for other 429 bodies", async () => {
    expect(
      await parseAiQuotaError(makeResponse(429, { error: "too_many_requests" })),
    ).toEqual({ kind: "rate_limit" });
    expect(await parseAiQuotaError(makeResponse(429))).toEqual({
      kind: "rate_limit",
    });
  });
});
