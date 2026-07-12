/**
 * Scenario 02 — anchor race.
 *
 * Race:
 *   Two concurrent `set_source_anchor` RPC calls on the same source, with
 *   different target balances (100 and 200). The RPC does
 *   SELECT ... FOR UPDATE on custom_payment_sources → the two calls MUST
 *   serialize, and the second one MUST overwrite the first cleanly (last
 *   write wins) — never leave the balance as a stale intermediate or a
 *   half-applied anchor.
 *
 * Backend path exercised:
 *   public.set_source_anchor(p_source_id, p_anchor_ts, p_anchor_balance)
 *
 * Invariants:
 *   1. Both RPCs return successfully (serialized, neither errors).
 *   2. Final `correction_anchor_balance` ∈ {100, 200} (not stale zero,
 *      not sum 300, not average 150).
 *   3. Final `balance` == `correction_anchor_balance` (RPC keeps them
 *      in sync after recompute).
 *   4. No orphan correction_anchor_date NULL (both anchors set the ts).
 */
import { admin, asUser, pool, runScenario } from "./_runner.ts";
import { assert, assertEq, assertOneOf } from "./_assert.ts";

const NS = "layer2-02";

async function main() {
  const res = await runScenario("02_anchor_race", async () => {
    const a = admin();
    const user0 = pool()[0];

    await a.from("custom_payment_sources").delete()
      .eq("user_id", user0.user_id).like("name", `${NS}-%`);

    const { data: src, error } = await a
      .from("custom_payment_sources")
      .insert({ user_id: user0.user_id, name: `${NS}-src`, balance: 0 })
      .select("id").single();
    if (error) throw error;
    const sourceId = src!.id as string;

    const client = asUser(0);
    const ts = new Date().toISOString();

    const [r1, r2] = await Promise.allSettled([
      client.rpc("set_source_anchor" as any, {
        p_source_id: sourceId, p_anchor_ts: ts, p_anchor_balance: 100,
      }),
      client.rpc("set_source_anchor" as any, {
        p_source_id: sourceId, p_anchor_ts: ts, p_anchor_balance: 200,
      }),
    ]);

    // Invariant 1: both settled successfully.
    for (const [i, r] of [r1, r2].entries()) {
      if (r.status === "rejected") throw new Error(`rpc${i + 1} rejected: ${r.reason}`);
      const err = (r.value as any).error;
      if (err) throw new Error(`rpc${i + 1} returned error: ${err.message}`);
    }

    const { data: row } = await a.from("custom_payment_sources")
      .select("balance, correction_anchor_balance, correction_anchor_date")
      .eq("id", sourceId).single();

    const anchor = Number(row!.correction_anchor_balance);
    const balance = Number(row!.balance);

    // Invariant 2: last-write-wins produced one of the two candidates.
    assertOneOf(anchor, [100, 200], "final anchor_balance");
    // Invariant 3: balance and anchor kept in sync.
    assertEq(balance, anchor, "balance vs anchor drift");
    // Invariant 4: anchor date set.
    assert(row!.correction_anchor_date !== null, "correction_anchor_date must not be NULL");
  });

  if (!res.ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
