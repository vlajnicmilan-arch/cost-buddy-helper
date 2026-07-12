/**
 * Scenario 04 — approve vs retract race.
 *
 * Setup:
 *   - user0 = author + punopravni + krug owner
 *   - user1 = punopravni (non-author governor)
 *   - Expense E: shared/predlozena, author=user0
 *
 * Race:
 *   user0 fires A3 (krug_retract → personal) at the same time user1 fires
 *   A1 (krug_apply_act confirm). Both RPCs SELECT ... FOR UPDATE on the
 *   same expense row → serialize.
 *
 *   Two admissible terminal states:
 *     (a) A3 wins first: expense is personal / status NULL.
 *         → A1 must return 'not_in_shared_flow'.
 *     (b) A1 wins first: expense is shared / potvrdjena.
 *         → A3 must return 'wrong_state' (status is no longer predlozena).
 *
 * Invariants:
 *   1. Exactly one RPC returns an OK outcome, the other a documented refusal.
 *   2. Final state matches the winner's outcome. No half-state, no third state.
 *   3. Both RPCs return without throwing — refusals are jsonb outcomes.
 */
import { admin, asUser, pool, runScenario } from "./_runner.ts";
import { assert, assertOneOf } from "./_assert.ts";

const NS = "layer2-04";

async function main() {
  const res = await runScenario("04_approve_vs_retract", async () => {
    const a = admin();
    const [u0, u1] = pool();

    const { data: oldKrugs } = await a.from("krug").select("id").like("name", `${NS}-%`);
    if (oldKrugs?.length) {
      const ids = oldKrugs.map((k: any) => k.id);
      await a.from("expenses").delete().in("krug_id", ids);
      await a.from("krug").delete().in("id", ids);
    }

    const { data: krug } = await a.from("krug")
      .insert({ name: `${NS}-k`, preset: "klub" as any, created_by: u0.user_id })
      .select("id").single();
    const krugId = krug!.id as string;

    await a.from("krug_membership").insert(
      { krug_id: krugId, user_id: u1.user_id, role: "punopravni", added_by: u0.user_id },
    );

    const today = new Date().toISOString().slice(0, 10);
    const { data: exp } = await a.from("expenses").insert({
      user_id: u0.user_id, amount: 10, type: "expense",
      payment_source: "cash", date: today,
      description: `${NS}-exp`, category: "other",
      krug_id: krugId, krug_privacy: "shared", krug_shared_status: "predlozena",
    }).select("id").single();
    const expenseId = exp!.id as string;

    const [rRetract, rApprove] = await Promise.allSettled([
      asUser(0).rpc("krug_retract" as any, {
        p_expense_id: expenseId, p_client_request_id: crypto.randomUUID(),
      }),
      asUser(1).rpc("krug_apply_act" as any, {
        p_expense_id: expenseId, p_act: "A1", p_client_request_id: crypto.randomUUID(),
      }),
    ]);

    // Invariant 3: no throws.
    for (const [name, r] of [["A3", rRetract], ["A1", rApprove]] as const) {
      if (r.status === "rejected") throw new Error(`${name} rejected: ${r.reason}`);
      const err = (r.value as any).error;
      if (err) throw new Error(`${name} rpc error: ${err.message}`);
    }

    const outA3 = ((rRetract as any).value.data as any)?.outcome as string;
    const outA1 = ((rApprove as any).value.data as any)?.outcome as string;

    const { data: final } = await a.from("expenses")
      .select("krug_privacy, krug_shared_status").eq("id", expenseId).single();

    // Invariant 1 + 2: one of the two admissible terminal states.
    const a3Won =
      outA3 === "ok_retracted"
      && outA1 === "not_in_shared_flow"
      && final!.krug_privacy === "personal"
      && final!.krug_shared_status === null;

    const a1Won =
      outA1 === "ok_confirmed"
      && outA3 === "wrong_state"
      && final!.krug_privacy === "shared"
      && final!.krug_shared_status === "potvrdjena";

    assert(
      a3Won || a1Won,
      `terminal state incoherent: A3=${outA3} A1=${outA1} privacy=${final!.krug_privacy} status=${final!.krug_shared_status}`,
    );

    // Also assert loser outcome is one of the two documented refusals (defence in depth).
    assertOneOf(
      a3Won ? outA1 : outA3,
      ["not_in_shared_flow", "wrong_state"] as const,
      "loser refusal outcome",
    );
  });

  if (!res.ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
