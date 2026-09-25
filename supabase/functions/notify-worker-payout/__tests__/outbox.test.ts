import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isInternalBearer, markOutboxDelivered, payoutEventKey } from "../outbox.ts";

Deno.test("ključ: jedna isplata → payout_id (i kad ima batch)", () => {
  assertEquals(payoutEventKey(["p1"], null, "created"), "worker_payout:p1:created");
  assertEquals(payoutEventKey(["p1"], "b1", "voided"), "worker_payout:p1:voided");
});

Deno.test("ključ: više isplata → batch_id", () => {
  assertEquals(payoutEventKey(["p1", "p2"], "b1", "created"), "worker_payout:b1:created");
});

Deno.test("interni bearer: samo anon ili servisni ključ", () => {
  assertEquals(isInternalBearer("Bearer ANON", "ANON", "SRV"), true);
  assertEquals(isInternalBearer("Bearer SRV", "ANON", "SRV"), true);
  assertEquals(isInternalBearer("Bearer a.b.c", "ANON", "SRV"), false);
  assertEquals(isInternalBearer(null, "ANON", "SRV"), false);
});

Deno.test("oznaka isporuke: poziv s dedup_ref", async () => {
  const calls: unknown[] = [];
  const ok = await markOutboxDelivered(
    { rpc: (fn, args) => { calls.push([fn, args]); return Promise.resolve({ error: null }); } },
    "worker_payout:p1:created",
  );
  assertEquals(ok, true);
  assertEquals(calls, [["krug_notify_outbox_mark_delivered", { p_dedup_ref: "worker_payout:p1:created" }]]);
});

Deno.test("oznaka isporuke: vraćena greška nije tiha", async () => {
  const ok = await markOutboxDelivered(
    { rpc: () => Promise.resolve({ error: { message: "denied" } }) },
    "worker_payout:p1:created",
  );
  assertEquals(ok, false);
});
