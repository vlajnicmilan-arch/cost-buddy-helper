// Shared helper: build & sign Enable Banking JWT (RS256)
// https://enablebanking.com/docs/api/reference/#authentication
import { SignJWT, importPKCS8 } from "npm:jose@5";

const APP_ID = Deno.env.get("ENABLE_BANKING_APP_ID")!;
const PRIVATE_KEY_PEM = Deno.env.get("ENABLE_BANKING_PRIVATE_KEY")!;

export const ENABLE_BANKING_BASE = "https://api.enablebanking.com";

let cachedKey: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  // Normalize line endings - secrets stored may strip newlines
  let pem = PRIVATE_KEY_PEM.trim();
  if (!pem.includes("\n")) {
    // Re-insert newlines if stored as single line
    pem = pem
      .replace(/-----BEGIN PRIVATE KEY-----/, "-----BEGIN PRIVATE KEY-----\n")
      .replace(/-----END PRIVATE KEY-----/, "\n-----END PRIVATE KEY-----")
      .replace(/(.{64})/g, "$1\n");
  }
  cachedKey = await importPKCS8(pem, "RS256");
  return cachedKey;
}

export async function getEnableBankingJwt(): Promise<string> {
  if (!APP_ID || !PRIVATE_KEY_PEM) {
    throw new Error("Missing ENABLE_BANKING_APP_ID or ENABLE_BANKING_PRIVATE_KEY");
  }
  const key = await getKey();
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({})
    .setProtectedHeader({ typ: "JWT", alg: "RS256", kid: APP_ID })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .sign(key);
}

export async function ebFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const jwt = await getEnableBankingJwt();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${jwt}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return await fetch(`${ENABLE_BANKING_BASE}${path}`, { ...init, headers });
}
