// One-shot verification of filter_projects_subscribers + splitInstantVsDigest.
// Picks real subscriber + non-subscriber users from DB and asserts the split.
// SAFE: read-only, no side effects.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { splitInstantVsDigest } from "../_shared/participantFilter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Pull real classifications
  const { data: subs } = await supa
    .from("user_subscriptions")
    .select("user_id, tier, expires_at")
    .in("tier", ["pro", "business"])
    .limit(3);
  const subUsers = (subs ?? [])
    .filter((s: any) => !s.expires_at || new Date(s.expires_at) > new Date())
    .map((s: any) => s.user_id);

  const { data: lifetimes } = await supa.from("lifetime_purchases").select("user_id").limit(2);
  const lifetimeUsers = (lifetimes ?? []).map((l: any) => l.user_id);

  const paidSet = new Set<string>([...subUsers, ...lifetimeUsers]);

  // Non-subscriber sample: pull from auth.users via admin API
  const { data: usersList } = await supa.auth.admin.listUsers({ page: 1, perPage: 20 });
  const allIds = (usersList?.users ?? []).map((u: any) => u.id);
  // Exclude admins
  const { data: adminRoles } = await supa.from("user_roles").select("user_id").eq("role", "admin");
  const adminSet = new Set<string>((adminRoles ?? []).map((r: any) => r.user_id));

  const nonPaid = allIds.filter((id) => !paidSet.has(id) && !adminSet.has(id)).slice(0, 3);

  // Test scenarios
  const fakeOwner = nonPaid[0] ?? "00000000-0000-0000-0000-000000000000";
  const candidates = [
    ...subUsers,
    ...lifetimeUsers,
    ...nonPaid.slice(1, 3), // participants
  ];

  const split = await splitInstantVsDigest(supa, fakeOwner, candidates);

  // Direct RPC sanity
  const { data: rpcResult, error: rpcErr } = await supa.rpc(
    "filter_projects_subscribers",
    { p_user_ids: candidates },
  );

  // Assertions
  const expectedInstant = candidates.filter((c) => c === fakeOwner || paidSet.has(c));
  const expectedDigest = candidates.filter((c) => c !== fakeOwner && !paidSet.has(c));

  const ok =
    split.instant.sort().join() === expectedInstant.sort().join() &&
    split.digestOnly.sort().join() === expectedDigest.sort().join();

  return new Response(
    JSON.stringify({
      verified: ok,
      input: {
        owner: fakeOwner,
        candidates,
        paidUsers: Array.from(paidSet),
      },
      split,
      expected: { instant: expectedInstant, digestOnly: expectedDigest },
      rpc: { result: rpcResult, error: rpcErr?.message ?? null },
    }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
