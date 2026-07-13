/**
 * Scenario 01 — same-source concurrent writes.
 *
 * Race:
 *   N parallel expense INSERTs against the same custom_payment_sources row,
 *   all owned by user0. Each is amount=1, type='expense'.
 *
 * Backend path exercised:
 *   direct table INSERT → `trg_expenses_recompute_source_balance`
 *   → incremental delta UPDATE of custom_payment_sources.balance
 *   (uses row-lock on the source; must not lose updates).
 *
 * Invariants (autoritativno):
 *   1. Stored balance == -N (no lost updates from concurrent triggers).
 *   2. Stored balance == recompute_custom_source_balance_preview()
 *      (engine internally consistent with ledger scan).
 *   3. Exactly N rows inserted (no INSERT swallowed).
 *
 * Latency is report-only.
 */
import { admin, asUser, pool, runScenario } from "./_runner.ts";
import { assert, assertEq } from "./_assert.ts";

const NS = "layer2-01";
const N = 10;

async function main() {
  const res = await runScenario("01_same_source_writes", async () => {
    const a = admin();
    const user0 = pool()[0];

    // Cleanup any leftovers from prior runs (idempotent).
    await a.from("expenses").delete().eq("user_id", user0.user_id).like("description", `${NS}-%`);
    await a.from("custom_payment_sources").delete()
      .eq("user_id", user0.user_id).like("name", `${NS}-%`);

    // Setup: create source with balance=0.
    const { data: src, error: sErr } = await a
      .from("custom_payment_sources")
      .insert({ user_id: user0.user_id, name: `${NS}-src`, balance: 0 })
      .select("id").single();
    if (sErr) throw sErr;
    const sourceId = src!.id as string;
    const sourceRef = `custom:${sourceId}`;

    // Race: N parallel INSERTs by user0 (via JWT client — goes through RLS + triggers).
    const client = asUser(0);
    const today = new Date().toISOString().slice(0, 10);
    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        client.from("expenses").insert({
          user_id: user0.user_id,
          amount: 1,
          type: "expense",
          payment_source: sourceRef,
          date: today,
          description: `${NS}-e${i}`,
          category: "other",
        }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected"
      || (r.status === "fulfilled" && (r.value as any).error));
    assert(failed.length === 0, `race: ${failed.length}/${N} inserts failed`);

    // Invariant 3: exactly N rows.
    const { count } = await a.from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user0.user_id).like("description", `${NS}-%`);
    assertEq(count, N, "insert count");

    // Invariant 1: stored balance.
    const { data: after } = await a.from("custom_payment_sources")
      .select("balance").eq("id", sourceId).single();
    const stored = Number(after!.balance);
    assertEq(stored, -N, "stored balance");

    // Invariant 2: engine vs. ledger reconciliation.
    // Mirror engine: recompute_custom_source_balance reads mode from
    // app_settings.anchor_engine_mode with 'day_cut' fallback. Preview MUST be
    // called with the same mode — hardcoding would fail in an env where the
    // setting is absent (engine → 'day_cut', invariant → 'hybrid' = false FAIL).
    const { data: modeRow } = await a
      .from("app_settings")
      .select("value")
      .eq("key", "anchor_engine_mode")
      .maybeSingle();
    const rawMode = (modeRow as any)?.value;
    const mode =
      typeof rawMode === "string"
        ? rawMode
        : (rawMode ?? "day_cut");
    const { data: preview, error: pErr } = await a.rpc(
      "recompute_custom_source_balance_preview" as any,
      { p_source_id: sourceId, p_mode: mode },
    );
    if (pErr) throw pErr;
    const previewNum = Number((preview as any) ?? NaN);
    assertEq(previewNum, stored, `balance drift (engine vs preview, mode=${mode})`);

  });

  if (!res.ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
