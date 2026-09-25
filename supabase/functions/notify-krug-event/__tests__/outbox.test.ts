import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { markOutboxDelivered } from "../outbox.ts";

function fakeAdmin(impl: (fn: string, args: Record<string, unknown>) => Promise<unknown>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return impl(fn, args);
    },
  };
}

Deno.test("označi delivered_at kod uspjeha", async () => {
  const admin = fakeAdmin(() => Promise.resolve({ data: null, error: null }));
  await markOutboxDelivered(admin, "krug_expense_confirmed:act:1");
  assertEquals(admin.calls.length, 1);
  assertEquals(admin.calls[0].fn, "krug_notify_outbox_mark_delivered");
  assertEquals(admin.calls[0].args, {
    p_dedup_ref: "krug_expense_confirmed:act:1",
  });
});

Deno.test("označi delivered_at i kod namjernog preskakanja (isti poziv)", async () => {
  // Namjerno preskakanje (dedup/preference) zove istu oznaku — pozivatelj
  // je zove bezuvjetno nakon obrade, pa je ponašanje identično uspjehu.
  const admin = fakeAdmin(() => Promise.resolve({ data: null, error: null }));
  await markOutboxDelivered(admin, "krug_expense_proposed:ins:9");
  assertEquals(admin.calls.length, 1);
});

Deno.test("bez dedup_ref ne zove RPC", async () => {
  const admin = fakeAdmin(() => Promise.resolve({ data: null, error: null }));
  await markOutboxDelivered(admin, null);
  await markOutboxDelivered(admin, undefined);
  assertEquals(admin.calls.length, 0);
});

Deno.test("kvar RPC-a se ne propagira (odgovor funkcije ostaje)", async () => {
  const admin = fakeAdmin(() => Promise.reject(new Error("db down")));
  // Ne smije baciti — povratak bez iznimke je uvjet.
  await markOutboxDelivered(admin, "x:1");
  assertEquals(admin.calls.length, 1);
});

Deno.test("rpc koji vrati error objekt također ne propagira", async () => {
  const admin = fakeAdmin(() =>
    Promise.resolve({ data: null, error: { message: "boom" } })
  );
  await markOutboxDelivered(admin, "x:2");
  assertEquals(admin.calls.length, 1);
});

// Čuvar protiv slučajnog bacanja: assertRejects ne smije pronaći iznimku.
Deno.test("nema rejectanja ni kod mrežne greške", async () => {
  const admin = fakeAdmin(() => Promise.reject(new TypeError("fetch failed")));
  await markOutboxDelivered(admin, "x:3");
  // Ako je došlo dovde, prošlo je; assertRejects bi ovdje bio kontraprimjer.
  await assertRejects(() => Promise.reject(new Error("kontrola")));
});
