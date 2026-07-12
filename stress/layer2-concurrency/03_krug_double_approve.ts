/**
 * Scenario 03 — Krug double-approve race.
 *
 * Setup (via admin, bypasses RLS):
 *   - user0 = author + krug owner
 *   - user1, user2 = punopravni members
 *   - Expense E: krug_privacy='shared', krug_shared_status='predlozena', author=user0
 *
 * Race:
 *   user1 and user2 both call krug_apply_act(E, 'A1') simultaneously with
 *   distinct client_request_id values. The RPC does SELECT ... FOR UPDATE
 *   on the expense row → serialization. Exactly one A1 transitions
 *   predlozena → potvrdjena; the other MUST see the already-changed status
 *   and return 'wrong_state'.
 *
 * Invariants:
 *   1. Distribution of outcomes: {ok_confirmed: 1, wrong_state: 1}.
 *   2. Final expense.krug_shared_status = 'potvrdjena'.
 *   3. Exactly 1 dedup row with outcome='ok_confirmed'
 *      (the wrong_state row is also inserted per RPC contract; we assert
 *      the terminal act is unique, i.e. no double confirmation persisted).
 */
import { admin, asUser, pool, runScenario } from "./_runner.ts";
import { assert, assertEq, assertDistribution } from "./_assert.ts";

const NS = "layer2-03";

async function main() {
  const res = await runScenario("03_krug_double_approve", async () => {
    const a = admin();
    const [u0, u1, u2] = pool();
    assert(u2 !== undefined, "need at least 3 users in token pool");

    // Cleanup previous run — order matters (children before parents).
    const { data: oldKrugs } = await a.from("krug").select("id").like("name", `${NS}-%`);
    if (oldKrugs?.length) {
      const ids = oldKrugs.map((k: any) => k.id);
      await a.from("expenses").delete().in("krug_id", ids);
      await a.from("krug").delete().in("id", ids);
    }

    // Setup krug (trigger krug_bootstrap_creator writes ownership + membership for creator).
    const { data: krug, error: kErr } = await a
      .from("krug")
      .insert({ name: `${NS}-k`, preset: "klub" as any, created_by: u0.user_id })
      .select("id").single();
    if (kErr) throw kErr;
    const krugId = krug!.id as string;

    // Add u1, u2 as punopravni.
    await a.from("krug_membership").insert([
      { krug_id: krugId, user_id: u1.user_id, role: "punopravni", added_by: u0.user_id },
      { krug_id: krugId, user_id: u2.user_id, role: "punopravni", added_by: u0.user_id },
    ]);

    // Author (u0) creates a shared/predlozena expense.
    const today = new Date().toISOString().slice(0, 10);
    const { data: exp, error: eErr } = await a.from("expenses").insert({
      user_id: u0.user_id, amount: 10, type: "expense",
      payment_source: "cash", date: today,
      description: `${NS}-exp`, category: "other",
      krug_id: krugId, krug_privacy: "shared", krug_shared_status: "predlozena",
    }).select("id").single();
    if (eErr) throw eErr;
    const expenseId = exp!.id as string;

    // Race: two governors call A1 concurrently.
    const c1 = asUser(1);
    const c2 = asUser(2);
    const [r1, r2] = await Promise.allSettled([
      c1.rpc("krug_apply_act" as any, {
        p_expense_id: expenseId, p_act: "A1",
        p_client_request_id: crypto.randomUUID(),
      }),
      c2.rpc("krug_apply_act" as any, {
        p_expense_id: expenseId, p_act: "A1",
        p_client_request_id: crypto.randomUUID(),
      }),
    ]);

    const outcomes: string[] = [];
    for (const [i, r] of [r1, r2].entries()) {
      if (r.status === "rejected") throw new Error(`rpc${i + 1} rejected: ${r.reason}`);
      const { data, error } = r.value as any;
      if (error) throw new Error(`rpc${i + 1} error: ${error.message}`);
      outcomes.push((data as any)?.outcome ?? "unknown");
    }

    // Invariant 1: exactly one confirmed, one wrong_state.
    assertDistribution(outcomes, { ok_confirmed: 1, wrong_state: 1 }, "A1 double-approve outcomes");

    // Invariant 2: terminal shared status.
    const { data: final } = await a.from("expenses")
      .select("krug_shared_status").eq("id", expenseId).single();
    assertEq(final!.krug_shared_status, "potvrdjena", "final krug_shared_status");

    // Invariant 3: exactly one persistent ok_confirmed dedup row for this expense.
    const { data: dedup } = await a.from("krug_act_dedup")
      .select("outcome").eq("expense_id", expenseId).eq("act", "A1");
    const okCount = (dedup ?? []).filter((d: any) => d.outcome === "ok_confirmed").length;
    assertEq(okCount, 1, "ok_confirmed dedup rows");
  });

  if (!res.ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
