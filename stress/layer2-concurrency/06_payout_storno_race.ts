/**
 * Scenario 06 — payout storno (void) race.
 *
 * Setup:
 *   - user0 = project owner + worker's user
 *   - Project P, Worker W (hourly_rate=10), a couple of work entries
 *   - Payout PO created via create_worker_payout RPC
 *
 * Race:
 *   Two concurrent `void_worker_payout(PO)` RPC calls. The RPC does
 *   SELECT ... FOR UPDATE with `status <> 'voided'`. First call wins;
 *   second call MUST see NOT FOUND and raise 'payout not found or already
 *   voided'. Exactly one void.
 *
 * Invariants:
 *   1. Exactly one RPC succeeds; the other errors with the documented text.
 *   2. Payout row: status='voided', voided_at NOT NULL, exactly one
 *      voided_by (i.e. no double toggle).
 *   3. Related expense soft-deleted exactly once (deleted_at NOT NULL).
 *   4. Work entries all unlocked (payout_id = NULL for every entry that
 *      was locked to PO). No entry left with stale payout_id.
 */
import { admin, asUser, pool, runScenario } from "./_runner.ts";
import { assert, assertEq } from "./_assert.ts";

const NS = "layer2-06";

async function main() {
  const res = await runScenario("06_payout_storno_race", async () => {
    const a = admin();
    const u0 = pool()[0];

    // Cleanup previous runs (children first).
    const { data: oldProjects } = await a.from("projects")
      .select("id").eq("user_id", u0.user_id).like("name", `${NS}-%`);
    if (oldProjects?.length) {
      const projIds = oldProjects.map((p: any) => p.id);
      await a.from("project_worker_payouts").delete().in("project_id", projIds);
      await a.from("project_work_entries").delete().in("project_id", projIds);
      await a.from("project_workers").delete().in("project_id", projIds);
      await a.from("expenses").delete().in("project_id", projIds);
      await a.from("projects").delete().in("id", projIds);
    }

    // Setup project + worker + entries.
    const { data: proj, error: pErr } = await a.from("projects")
      .insert({ user_id: u0.user_id, name: `${NS}-p`, status: "active" })
      .select("id").single();
    if (pErr) throw pErr;
    const projectId = proj!.id as string;

    const { data: worker, error: wErr } = await a.from("project_workers")
      .insert({
        project_id: projectId,
        user_id: u0.user_id,
        first_name: "Layer2",
        last_name: "Worker",
        hourly_rate: 10,
      })
      .select("id").single();
    if (wErr) throw wErr;
    const workerId = worker!.id as string;

    const today = new Date().toISOString().slice(0, 10);
    await a.from("project_work_entries").insert([
      { project_id: projectId, worker_id: workerId, work_date: today, actual_hours: 4 },
      { project_id: projectId, worker_id: workerId, work_date: today, actual_hours: 4 },
    ]);

    // Create payout via RPC as owner.
    const client = asUser(0);
    const { data: payoutJson, error: cErr } = await client.rpc(
      "create_worker_payout" as any,
      {
        p_worker_id: workerId,
        p_project_id: projectId,
        p_period_start: today,
        p_period_end: today,
        p_paid_amount: 80,
        p_payment_source: "cash",
        p_paid_at: new Date().toISOString(),
        p_note: `${NS}-payout`,
        p_lock_entries: true,
      },
    );
    if (cErr) throw cErr;
    const payoutId = (payoutJson as any).payout_id as string;
    const expenseId = (payoutJson as any).expense_id as string;

    // Race: two voids in parallel.
    const [v1, v2] = await Promise.allSettled([
      client.rpc("void_worker_payout" as any, { p_payout_id: payoutId, p_reason: `${NS}-r1` }),
      client.rpc("void_worker_payout" as any, { p_payout_id: payoutId, p_reason: `${NS}-r2` }),
    ]);

    // Invariant 1: exactly one success.
    let successCount = 0;
    let refusedCount = 0;
    for (const r of [v1, v2]) {
      if (r.status === "rejected") { refusedCount++; continue; }
      const err = (r.value as any).error;
      if (err) {
        refusedCount++;
        if (!/not found or already voided/i.test(err.message ?? "")) {
          throw new Error(`unexpected void error: ${err.message}`);
        }
      } else {
        successCount++;
      }
    }
    assertEq(successCount, 1, "void success count");
    assertEq(refusedCount, 1, "void refusal count");

    // Invariant 2: payout terminally voided, exactly one voided_by.
    const { data: po } = await a.from("project_worker_payouts")
      .select("status, voided_at, voided_by").eq("id", payoutId).single();
    assertEq(po!.status, "voided", "payout status");
    assert(po!.voided_at !== null, "voided_at must be set");
    assertEq(po!.voided_by, u0.user_id, "voided_by must be caller");

    // Invariant 3: expense soft-deleted.
    const { data: exp } = await a.from("expenses")
      .select("deleted_at").eq("id", expenseId).single();
    assert(exp!.deleted_at !== null, "expense must be soft-deleted");

    // Invariant 4: no work_entries still linked to the voided payout.
    const { count: stillLocked } = await a.from("project_work_entries")
      .select("id", { count: "exact", head: true }).eq("payout_id", payoutId);
    assertEq(stillLocked, 0, "work entries still linked to voided payout");
  });

  if (!res.ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
