/**
 * Paddle webhook signature verification (Billing / v2).
 *
 * Header format: `Paddle-Signature: ts=1700000000;h1=<hex-hmac-sha256>`
 * Signed payload: `${ts}:${rawBody}` with secret = notification setting's
 * webhook secret. HMAC-SHA256, hex-encoded, constant-time compared.
 *
 * Docs: https://developer.paddle.com/webhooks/signature-verification
 *
 * Pure module — no Deno / Supabase imports — so it can be unit-tested
 * from vitest under src/ scan without a Deno runtime.
 */

export interface ParsedSignature {
  ts: number;
  h1: string[];
}

export function parsePaddleSignature(header: string | null | undefined): ParsedSignature | null {
  if (!header) return null;
  const parts = header.split(";").map((p) => p.trim()).filter(Boolean);
  let ts: number | null = null;
  const h1: string[] = [];
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    const k = p.slice(0, eq).trim().toLowerCase();
    const v = p.slice(eq + 1).trim();
    if (k === "ts") {
      if (!/^\d+$/.test(v)) return null;
      const n = Number(v);
      if (!Number.isSafeInteger(n)) return null;
      ts = n;
    } else if (k === "h1") {
      if (v) h1.push(v.toLowerCase());
    }
  }
  if (ts === null || h1.length === 0) return null;
  return { ts, h1 };
}

/** Constant-time hex compare. Assumes lowercase hex, equal length required. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Compute HMAC-SHA256(secret, `${ts}:${rawBody}`) → lowercase hex. */
export async function computePaddleHmac(
  secret: string,
  ts: number,
  rawBody: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}:${rawBody}`));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export interface VerifyOptions {
  /** Max allowed age of the signed timestamp, in seconds. Default 300 (5 min). */
  toleranceSeconds?: number;
  /** Override "now" for testing. Seconds since epoch. */
  nowSeconds?: number;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_header" | "bad_format" | "stale" | "bad_signature" | "no_secret" };

export async function verifyPaddleSignature(
  rawBody: string,
  headerValue: string | null | undefined,
  secret: string | undefined,
  opts: VerifyOptions = {},
): Promise<VerifyResult> {
  const normalizedSecret = secret?.trim();
  if (!normalizedSecret) return { ok: false, reason: "no_secret" };
  if (!headerValue) return { ok: false, reason: "missing_header" };
  const parsed = parsePaddleSignature(headerValue);
  if (!parsed) return { ok: false, reason: "bad_format" };

  const tolerance = opts.toleranceSeconds ?? 300;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.ts) > tolerance) return { ok: false, reason: "stale" };

  const expected = await computePaddleHmac(normalizedSecret, parsed.ts, rawBody);
  return parsed.h1.some((signature) => timingSafeEqualHex(expected, signature))
    ? { ok: true }
    : { ok: false, reason: "bad_signature" };
}
