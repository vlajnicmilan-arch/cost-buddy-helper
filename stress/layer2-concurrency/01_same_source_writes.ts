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

    // Setup: create TWO sources — one anchored (exercises preview/anchor path),
    // one unanchored (exercises delta-only path). Both must survive N parallel
    // inserts without lost updates. Invariant I5 in krug.sql discriminates by
    // anchor presence: preview check for anchored, SUM check for unanchored.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const { data: srcA, error: sErrA } = await a
      .from("custom_payment_sources")
      .insert({
        user_id: user0.user_id,
        name: `${NS}-src-anchored`,
        balance: 0,
        correction_anchor_date: yesterday,
        correction_anchor_balance: 0,
      })
      .select("id").single();
    if (sErrA) throw sErrA;
    const { data: srcU, error: sErrU } = await a
      .from("custom_payment_sources")
      .insert({ user_id: user0.user_id, name: `${NS}-src-unanchored`, balance: 0 })
      .select("id").single();
    if (sErrU) throw sErrU;
    const anchoredId = srcA!.id as string;
    const unanchoredId = srcU!.id as string;

    // Race: N parallel INSERTs against BOTH sources by user0 (via JWT client
    // — goes through RLS + triggers).
    const client = asUser(0);
    const today = new Date().toISOString().slice(0, 10);
    const insertsFor = (srcId: string, tag: string) =>
      Array.from({ length: N }, (_, i) =>
        client.from("expenses").insert({
          user_id: user0.user_id,
          amount: 1,
          type: "expense",
          payment_source: `custom:${srcId}`,
          date: today,
          description: `${NS}-${tag}-e${i}`,
          category: "other",
        }),
      );
    const results = await Promise.allSettled([
      ...insertsFor(anchoredId, "a"),
      ...insertsFor(unanchoredId, "u"),
    ]);
    const failed = results.filter((r) => r.status === "rejected"
      || (r.status === "fulfilled" && (r.value as any).error));
    assert(failed.length === 0, `race: ${failed.length}/${2 * N} inserts failed`);

    // Invariant 3: exactly 2N rows.
    const { count } = await a.from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user0.user_id).like("description", `${NS}-%`);
    assertEq(count, 2 * N, "insert count");

    // Invariant 1: stored balance on both sources (no lost updates).
    const { data: afterA } = await a.from("custom_payment_sources")
      .select("balance").eq("id", anchoredId).single();
    const storedA = Number(afterA!.balance);
    assertEq(storedA, -N, "stored balance (anchored)");
    const { data: afterU } = await a.from("custom_payment_sources")
      .select("balance").eq("id", unanchoredId).single();
    const storedU = Number(afterU!.balance);
    assertEq(storedU, -N, "stored balance (unanchored)");

    // Invariant 2a: anchored source — engine vs preview reconciliation.
    // Mirror engine: recompute_custom_source_balance reads mode from
    // app_settings.anchor_engine_mode with 'day_cut' fallback. Preview MUST be
    // called with the same mode.
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
      { p_source_id: anchoredId, p_mode: mode },
    );
    if (pErr) throw pErr;
    const previewNum = Number((preview as any) ?? NaN);
    assertEq(previewNum, storedA, `balance drift anchored (engine vs preview, mode=${mode})`);

    // Invariant 2b: unanchored source — preview returns NULL by design
    // (guard: v_anchor_date IS NULL → RETURN NULL). Stored balance is
    // authoritative via the delta trigger path; assert direct SUM matches
    // (mirrors engine CASE: income +, expense -, transfer -/+, exclude
    // soft-deleted, exclude corrections; no anchor cutoff).
    const { data: rows, error: rowsErr } = await a
      .from("expenses")
      .select("amount, type, expense_nature, income_source_id")
      .eq("user_id", user0.user_id)
      .eq("payment_source", `custom:${unanchoredId}`)
      .is("deleted_at", null);
    if (rowsErr) throw rowsErr;
    let sum = 0;
    for (const r of rows ?? []) {
      const nature = (r as any).expense_nature ?? "regular";
      if (nature === "correction") continue;
      const amt = Number((r as any).amount);
      const t = (r as any).type as string;
      if (t === "income") sum += amt;
      else if (t === "expense") sum -= amt;
      else if (t === "transfer") sum -= amt; // outbound from this source
    }
    assertEq(sum, storedU, "balance drift unanchored (stored vs SUM)");

  });

  if (!res.ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
