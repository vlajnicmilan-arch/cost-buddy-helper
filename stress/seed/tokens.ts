/**
 * Optional auth mode (STRESS_AUTH_MODE=mint). Mints JWTs locally using
 * GOTRUE_JWT_SECRET from `supabase status --output env`.
 *
 * FAIL-FAST: no hardcoded fallback secret. If the secret is not exported
 * into the environment BEFORE this runs, the script exits with a clear
 * message pointing at `supabase status --output env`.
 *
 * When to prefer over login mode:
 *   - Very large user pools where login latency dominates seed time
 *   - CI runs where the login endpoint is throttled
 *
 * When NOT to use:
 *   - If your local Supabase version has diverged from the documented
 *     secret export mechanism. Use login mode instead.
 */
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const URL = mustEnv("STRESS_SUPABASE_URL");

const SECRET = process.env.GOTRUE_JWT_SECRET;
if (!SECRET || SECRET.trim().length < 16) {
  console.error("mint: GOTRUE_JWT_SECRET not set (or too short).");
  console.error("mint: obtain it via `supabase status --output env` and export before running.");
  console.error("mint: or switch to STRESS_AUTH_MODE=login (default, robust).");
  process.exit(1);
}

assertLocal(URL);

type SeedFile = { users: { id: string; email: string }[] };

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function mintJWT(sub: string, email: string, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: "authenticated",
    role: "authenticated",
    sub,
    email,
    iat: now,
    exp: now + 60 * 60 * 24, // 24h — harness lifetime
  };
  const h = b64url(Buffer.from(JSON.stringify(header)));
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", secret).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}

async function main() {
  const seedPath = join(__dirname, "..", "reports", "seed-users.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as SeedFile;

  const pool = seed.users.map((u) => ({
    user_id: u.id,
    email: u.email,
    access_token: mintJWT(u.id, u.email, SECRET!),
  }));

  const out = join(__dirname, "..", "reports", "tokens.json");
  writeFileSync(out, JSON.stringify({ mode: "mint", pool }, null, 2));
  console.log(`auth(mint): pool size=${pool.length} → ${out}`);
}

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`mint: missing env ${name}`); process.exit(1); }
  return v;
}
function assertLocal(url: string) {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url)) {
    console.error(`mint: refusing non-local URL ${url}`); process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
