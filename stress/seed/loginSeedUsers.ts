/**
 * Default auth mode. Logs each seed user in via GoTrue password grant and
 * writes access_token pool to reports/tokens.json.
 *
 * Robust against JWT secret drift because it uses the real login endpoint.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const URL = mustEnv("STRESS_SUPABASE_URL");
const ANON = mustEnv("STRESS_SUPABASE_ANON_KEY");
const PASSWORD = process.env.STRESS_SEED_PASSWORD ?? "stress-test-pw-local-only";

assertLocal(URL);

type SeedFile = { users: { id: string; email: string }[] };

async function main() {
  const seedPath = join(__dirname, "..", "reports", "seed-users.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as SeedFile;

  const pool: { user_id: string; email: string; access_token: string }[] = [];
  for (const u of seed.users) {
    const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON },
      body: JSON.stringify({ email: u.email, password: PASSWORD }),
    });
    if (!res.ok) {
      throw new Error(`login ${u.email}: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { access_token: string };
    pool.push({ user_id: u.id, email: u.email, access_token: body.access_token });
  }

  const out = join(__dirname, "..", "reports", "tokens.json");
  writeFileSync(out, JSON.stringify({ mode: "login", pool }, null, 2));
  console.log(`auth(login): pool size=${pool.length} → ${out}`);
}

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`login: missing env ${name}`); process.exit(1); }
  return v;
}
function assertLocal(url: string) {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url)) {
    console.error(`login: refusing non-local URL ${url}`); process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
