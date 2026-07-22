import { describe, it, expect } from "vitest";
import {
  parsePaddleSignature,
  timingSafeEqualHex,
  computePaddleHmac,
  verifyPaddleSignature,
} from "@/lib/paddleSignature";

const SECRET = "pdl_ntfset_test_secret";

async function makeHeader(body: string, ts: number, secret = SECRET) {
  const h1 = await computePaddleHmac(secret, ts, body);
  return `ts=${ts};h1=${h1}`;
}

describe("parsePaddleSignature", () => {
  it("parses ts + h1", () => {
    expect(parsePaddleSignature("ts=1700000000;h1=abc")).toEqual({ ts: 1700000000, h1: ["abc"] });
  });
  it("tolerates whitespace and extra parts", () => {
    expect(parsePaddleSignature(" ts=1700000000 ; h1=DEAD ; junk=x "))
      .toEqual({ ts: 1700000000, h1: ["dead"] });
  });
  it("collects multiple h1 values used during secret rotation", () => {
    expect(parsePaddleSignature("ts=1700000000;h1=AAAA;h1=bbbb")).toEqual({
      ts: 1700000000,
      h1: ["aaaa", "bbbb"],
    });
  });
  it("returns null on garbage", () => {
    expect(parsePaddleSignature("")).toBeNull();
    expect(parsePaddleSignature(null)).toBeNull();
    expect(parsePaddleSignature("nope")).toBeNull();
    expect(parsePaddleSignature("ts=notanumber;h1=abc")).toBeNull();
    expect(parsePaddleSignature("ts=1;h1=")).toBeNull();
  });
});

describe("timingSafeEqualHex", () => {
  it("equal strings match", () => {
    expect(timingSafeEqualHex("abcd", "abcd")).toBe(true);
  });
  it("different strings don't match", () => {
    expect(timingSafeEqualHex("abcd", "abce")).toBe(false);
  });
  it("length mismatch fails", () => {
    expect(timingSafeEqualHex("abc", "abcd")).toBe(false);
  });
});

describe("verifyPaddleSignature", () => {
  const body = JSON.stringify({ event_id: "evt_1", event_type: "subscription.created" });
  const now = 1_700_000_000;

  it("accepts a valid signature within tolerance", async () => {
    const header = await makeHeader(body, now);
    const res = await verifyPaddleSignature(body, header, SECRET, { nowSeconds: now });
    expect(res.ok).toBe(true);
  });

  it("trims accidental edge whitespace from the webhook secret", async () => {
    const header = await makeHeader(body, now);
    const res = await verifyPaddleSignature(body, header, ` \n${SECRET}\r\n`, { nowSeconds: now });
    expect(res.ok).toBe(true);
  });

  it("accepts any matching h1 when Paddle sends multiple signatures", async () => {
    const valid = await makeHeader(body, now);
    const validH1 = valid.split("h1=")[1];
    const header = `ts=${now};h1=${"0".repeat(64)};h1=${validH1}`;
    const res = await verifyPaddleSignature(body, header, SECRET, { nowSeconds: now });
    expect(res.ok).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const header = await makeHeader(body, now);
    const res = await verifyPaddleSignature(body + "x", header, SECRET, { nowSeconds: now });
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects wrong secret", async () => {
    const header = await makeHeader(body, now, "other");
    const res = await verifyPaddleSignature(body, header, SECRET, { nowSeconds: now });
    expect(res).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects stale timestamp (>5min)", async () => {
    const header = await makeHeader(body, now - 600);
    const res = await verifyPaddleSignature(body, header, SECRET, { nowSeconds: now });
    expect(res).toEqual({ ok: false, reason: "stale" });
  });

  it("rejects future timestamp (>5min ahead)", async () => {
    const header = await makeHeader(body, now + 600);
    const res = await verifyPaddleSignature(body, header, SECRET, { nowSeconds: now });
    expect(res).toEqual({ ok: false, reason: "stale" });
  });

  it("rejects missing header", async () => {
    const res = await verifyPaddleSignature(body, null, SECRET, { nowSeconds: now });
    expect(res).toEqual({ ok: false, reason: "missing_header" });
  });

  it("rejects missing secret (misconfiguration)", async () => {
    const header = await makeHeader(body, now);
    const res = await verifyPaddleSignature(body, header, undefined, { nowSeconds: now });
    expect(res).toEqual({ ok: false, reason: "no_secret" });
  });

  it("rejects malformed header", async () => {
    const res = await verifyPaddleSignature(body, "garbage", SECRET, { nowSeconds: now });
    expect(res).toEqual({ ok: false, reason: "bad_format" });
  });
});

// Idempotency logic sanity test — the webhook_events table has a
// UNIQUE(provider, event_id) index. Simulate the shape by using a Set.
describe("idempotency via event_id set", () => {
  it("second insert of same event_id is a no-op", () => {
    const seen = new Set<string>();
    const process = (id: string) => {
      if (seen.has(id)) return "duplicate";
      seen.add(id);
      return "processed";
    };
    expect(process("evt_1")).toBe("processed");
    expect(process("evt_1")).toBe("duplicate");
    expect(process("evt_2")).toBe("processed");
  });
});
