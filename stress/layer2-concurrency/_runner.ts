/**
 * Layer 2 — shared runner + fixtures.
 *
 * Responsibilities:
 *   - Load env (STRESS_SUPABASE_URL, ANON, SERVICE_ROLE_KEY, DB_URL).
 *   - Load token pool from stress/reports/tokens.json (produced by Faza 1
 *     seed/loginSeedUsers.ts). Layer 2 does NOT create new users; it reuses
 *     the smoke seed's stress-0000..stress-0004.
 *   - Expose:
 *       * `admin()` — service-role client (bypasses RLS, used for setup).
 *       * `asUser(idx)` — anon client with the Nth user's JWT (for RPC calls
 *         that read `auth.uid()`).
 *   - `runScenario(name, fn)` — timed wrapper with structured pass/fail log.
 *     Latency is REPORT-ONLY; only thrown errors fail the scenario.
 *
 * Fixture namespacing:
 *   Every scenario prefixes its DB rows with `layer2-<id>-` in name/description
 *   so `stress/invariants/*.sql` can sweep only Layer 2 state.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const URL_ = mustEnv("STRESS_SUPABASE_URL");
export const ANON = mustEnv("STRESS_SUPABASE_ANON_KEY");
export const SERVICE_KEY = mustEnv("STRESS_SUPABASE_SERVICE_ROLE_KEY");
export const DB_URL = mustEnv("STRESS_SUPABASE_DB_URL");

assertLocal(URL_);
assertLocal(DB_URL);

export type PoolEntry = { user_id: string; email: string; access_token: string };
type PoolFile = { mode: string; pool: PoolEntry[] };

let _pool: PoolEntry[] | null = null;
export function pool(): PoolEntry[] {
  if (_pool) return _pool;
  const path = join(__dirname, "..", "reports", "tokens.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as PoolFile;
  if (!raw.pool || raw.pool.length < 3) {
    throw new Error(
      `layer2: token pool has ${raw.pool?.length ?? 0} entries; need at least 3 (run stress/bin/run-all.sh --smoke first).`,
    );
  }
  _pool = raw.pool;
  return _pool;
}

let _admin: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(URL_, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _admin;
}

export function asUser(idx: number): SupabaseClient {
  const p = pool();
  if (idx >= p.length) throw new Error(`layer2: pool[${idx}] out of range (size=${p.length})`);
  return createClient(URL_, ANON, {
    global: { headers: { Authorization: `Bearer ${p[idx].access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type ScenarioResult = {
  name: string;
  ok: boolean;
  durationMs: number;
  error?: string;
};

export async function runScenario(name: string, fn: () => Promise<void>): Promise<ScenarioResult> {
  const t0 = performance.now();
  process.stdout.write(`  [${name}] running... `);
  try {
    await fn();
    const dt = Math.round(performance.now() - t0);
    console.log(`PASS (${dt} ms)`);
    return { name, ok: true, durationMs: dt };
  } catch (e: any) {
    const dt = Math.round(performance.now() - t0);
    const msg = e?.message ?? String(e);
    console.error(`FAIL (${dt} ms): ${msg}`);
    return { name, ok: false, durationMs: dt, error: msg };
  }
}

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`layer2: missing env ${name}`); process.exit(1); }
  return v;
}

function assertLocal(url: string) {
  if (!/^(https?|postgresql|postgres):\/\/([^@]+@)?(localhost|127\.0\.0\.1)(:\d+)?/.test(url)) {
    console.error(`layer2: refusing non-local URL ${url}`);
    process.exit(1);
  }
}
