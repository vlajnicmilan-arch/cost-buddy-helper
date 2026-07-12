/**
 * Scenario 05 — share/unshare race on krug_shared_payment_source.
 *
 * Setup:
 *   - user0 = krug owner + custom_payment_sources owner
 *
 * Race:
 *   R iterations. Each iteration fires INSERT and DELETE for the same
 *   (krug_id, payment_source_id) pair in parallel. The table has
 *   UNIQUE (krug_id, payment_source_id) — a lost race must be visible
 *   only as a documented duplicate, never as multiple live rows.
 *
 * Backend path exercised:
 *   direct table INSERT/DELETE through RLS policies + UNIQUE constraint.
 *
 * Invariants:
 *   1. Per iteration and at the end: 0 or 1 row for (krug_id, source_id).
 *      Never > 1 (UNIQUE would raise; assertion catches a leaked duplicate
 *      state if the constraint ever regressed).
 *   2. No duplicate PK id (indirect: distinct id count == row count).
 *   3. Any INSERT that failed must fail with the documented duplicate
 *      error (23505) OR RLS 42501 — never a silent success.
 */
import { admin, asUser, pool, runScenario } from "./_runner.ts";
import { assert } from "./_assert.ts";

const NS = "layer2-05";
const ITERATIONS = 8;

async function main() {
  const res = await runScenario("05_share_unshare_race", async () => {
    const a = admin();
    const u0 = pool()[0];

    const { data: oldKrugs } = await a.from("krug").select("id").like("name", `${NS}-%`);
    if (oldKrugs?.length) {
      const ids = oldKrugs.map((k: any) => k.id);
      await a.from("krug_shared_payment_source").delete().in("krug_id", ids);
      await a.from("krug").delete().in("id", ids);
    }
    await a.from("custom_payment_sources").delete()
      .eq("user_id", u0.user_id).like("name", `${NS}-%`);

    const { data: krug } = await a.from("krug")
      .insert({ name: `${NS}-k`, preset: "klub" as any, created_by: u0.user_id })
      .select("id").single();
    const krugId = krug!.id as string;

    const { data: src } = await a.from("custom_payment_sources")
      .insert({ user_id: u0.user_id, name: `${NS}-src`, balance: 0 })
      .select("id").single();
    const sourceRef = `custom:${src!.id}`;

    const client = asUser(0);

    for (let i = 0; i < ITERATIONS; i++) {
      const [ins, del] = await Promise.allSettled([
        client.from("krug_shared_payment_source").insert({
          krug_id: krugId, payment_source_id: sourceRef, linked_by: u0.user_id,
        }),
        client.from("krug_shared_payment_source").delete()
          .eq("krug_id", krugId).eq("payment_source_id", sourceRef),
      ]);

      // Any INSERT failure must be either 23505 (dup) or RLS 42501; DELETE always OK (noop allowed).
      if (ins.status === "fulfilled") {
        const err = (ins.value as any).error;
        if (err && !["23505", "42501"].includes(err.code)) {
          throw new Error(`iter ${i}: unexpected INSERT error code=${err.code} msg=${err.message}`);
        }
      }
      if (del.status === "rejected") throw new Error(`iter ${i}: DELETE rejected: ${del.reason}`);

      const { data: rows, count } = await a.from("krug_shared_payment_source")
        .select("id", { count: "exact" })
        .eq("krug_id", krugId).eq("payment_source_id", sourceRef);
      assert((count ?? 0) <= 1, `iter ${i}: duplicate live rows count=${count}`);
      const distinctIds = new Set((rows ?? []).map((r: any) => r.id));
      assert(distinctIds.size === (rows?.length ?? 0), `iter ${i}: duplicate PK detected`);
    }

    // Terminal check.
    const { count: finalCount } = await a.from("krug_shared_payment_source")
      .select("id", { count: "exact", head: true })
      .eq("krug_id", krugId).eq("payment_source_id", sourceRef);
    assert((finalCount ?? 0) <= 1, `terminal duplicate count=${finalCount}`);
  });

  if (!res.ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
