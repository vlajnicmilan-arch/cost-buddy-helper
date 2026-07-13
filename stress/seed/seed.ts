/**
 * Faza 1 seed. Uses service-role key against local Supabase.
 *
 * ACTUAL volumes produced today:
 *   smoke: 5 auth users, 2 projects (first 2 users), 2 expenses, 0 krugova.
 *          Minimal-but-honest - enough to validate seed -> login pipe.
 *   full:  STUB. Only auth users are created; no domain rows.
 *          Full-volume domain seed (200/20/30/15k) is a Faza 2 deliverable.
 *          run-all.sh --full refuses to run in Faza 1.
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const URL = mustEnv("STRESS_SUPABASE_URL");
const SERVICE_KEY = mustEnv("STRESS_SUPABASE_SERVICE_ROLE_KEY");
const PASSWORD = process.env.STRESS_SEED_PASSWORD ?? "stress-test-pw-local-only";
const MODE = (process.env.STRESS_SEED_MODE ?? "smoke") as "smoke" | "full" | "layer1";

assertLocal(URL);

// Honest volume: what the code below actually inserts.
// full == users only (domain rows are Faza 2).
// layer1 == 50 users, each with exactly one custom_payment_source
//          (25 anchored, 25 unanchored). k6 load hits both engine branches.
const VOLUME = MODE === "full"
  ? { users: 200, krugovi: 0, projekti: 0, expenses: 0 }
  : MODE === "layer1"
    ? { users: 50, krugovi: 0, projekti: 0, expenses: 0 }
    : { users: 5,   krugovi: 0, projekti: 2, expenses: 2 };


const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`seed: mode=${MODE} volume=${JSON.stringify(VOLUME)}`);

  // Parity with production: anchor_engine_mode='hybrid'. Engine and harness
  // both read this dynamically (no hardcoding); we seed it so local runs
  // exercise the same branch as prod. Fallback in engine/harness remains
  // 'day_cut' if the row is somehow absent.
  {
    const { error } = await admin
      .from("app_settings")
      .upsert({ key: "anchor_engine_mode", value: "hybrid" }, { onConflict: "key" });
    if (error) throw new Error(`upsert anchor_engine_mode: ${error.message}`);
    console.log("seed: app_settings.anchor_engine_mode = 'hybrid'");
  }


  const users: { id: string; email: string }[] = [];
  for (let i = 0; i < VOLUME.users; i++) {
    const email = `stress-${i.toString().padStart(4, "0")}@local.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) {
      if (String(error.message).toLowerCase().includes("already")) {
        // Idempotent: fetch existing user id
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1_000 });
        const existing = list?.users.find((u) => u.email === email);
        if (existing) { users.push({ id: existing.id, email }); continue; }
      }
      throw new Error(`createUser ${email}: ${error.message}`);
    }
    users.push({ id: data.user!.id, email });
    if ((i + 1) % 50 === 0) console.log(`  users: ${i + 1}/${VOLUME.users}`);
  }
  console.log(`seed: created ${users.length} users`);

  // NOTE: krugovi/projekti/expenses seeding is Faza 2 concern. We create
  // just enough here to prove the pipe: 1 project + 1 expense per user in
  // smoke mode. Full-volume domain seed lives in Faza 2 fixtures.
  if (MODE === "smoke") {
    for (const u of users.slice(0, 2)) {
      const { data: proj, error: pe } = await admin
        .from("projects")
        .insert({ user_id: u.id, name: `stress-proj-${u.email}`, status: "active" })
        .select("id").single();
      if (pe) throw new Error(`insert project: ${pe.message}`);
      const { error: ee } = await admin.from("expenses").insert({
        user_id: u.id,
        amount: 100,
        type: "expense",
        description: "stress smoke seed",
        date: new Date().toISOString().slice(0, 10),
        project_id: proj?.id,
      });
      if (ee) throw new Error(`insert expense: ${ee.message}`);
    }
  } else if (MODE === "layer1") {
    // One custom_payment_source per user, prefixed 'layer1-src-'.
    // First half anchored (correction_anchor_date = now()-1d, balance=0),
    // second half unanchored — k6 load hits both engine branches under
    // concurrent INSERT expense (FOR UPDATE on anchored path is the crown jewel).
    const anchorTs = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const sources: { user_id: string; source_id: string; anchored: boolean }[] = [];
    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const anchored = i < Math.floor(users.length / 2);
      const row: Record<string, unknown> = {
        user_id: u.id,
        name: `layer1-src-${i.toString().padStart(4, "0")}`,
      };
      if (anchored) {
        row.correction_anchor_date = anchorTs;
        row.correction_anchor_balance = 0;
        row.balance = 0;
      }
      const { data, error } = await admin
        .from("custom_payment_sources")
        .insert(row).select("id").single();
      if (error) throw new Error(`insert custom_payment_sources ${u.email}: ${error.message}`);
      sources.push({ user_id: u.id, source_id: data!.id as string, anchored });
    }
    console.log(`seed(layer1): created ${sources.length} sources (${sources.filter(s => s.anchored).length} anchored / ${sources.filter(s => !s.anchored).length} unanchored)`);
    const outDirL1 = join(__dirname, "..", "reports");
    mkdirSync(outDirL1, { recursive: true });
    writeFileSync(join(outDirL1, "layer1-sources.json"), JSON.stringify({ sources }, null, 2));
  } else {
    console.log("seed: full-volume domain seed is Faza 2 (stubbed here)");
  }


  // Persist user roster for the auth pool step
  const outDir = join(__dirname, "..", "reports");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "seed-users.json"), JSON.stringify({ mode: MODE, users }, null, 2));
  console.log(`seed: wrote ${users.length} users to reports/seed-users.json`);
}

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`seed: missing env ${name}`); process.exit(1); }
  return v;
}

function assertLocal(url: string) {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url)) {
    console.error(`seed: refusing non-local URL ${url}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
