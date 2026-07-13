// Runtime test for send-member-invitation ownership enforcement.
// - Scenario (a): owner invites to own project -> 200 success, invitation row created.
// - Scenario (b): non-owner invites to someone else's project -> 403, zero rows inserted.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/send-member-invitation`;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

async function createSignedInUser(tag: string) {
  const email = `owncheck+${tag}+${crypto.randomUUID()}@vmbalance-test.local`;
  const password = crypto.randomUUID() + "Aa1!";
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (cErr || !created.user) throw new Error(`createUser ${tag}: ${cErr?.message}`);
  const anon = createClient(SUPABASE_URL, ANON);
  const { data: signed, error: sErr } = await anon.auth.signInWithPassword({ email, password });
  if (sErr || !signed.session) throw new Error(`signIn ${tag}: ${sErr?.message}`);
  return { userId: created.user.id, email, jwt: signed.session.access_token };
}

async function invoke(jwt: string, body: unknown) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${jwt}`, "Content-Type": "application/json", "apikey": ANON },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }
  return { status: res.status, json, text };
}

Deno.test("send-member-invitation enforces ownership", async () => {
  const owner = await createSignedInUser("owner");
  const attacker = await createSignedInUser("att");
  // A third user is the invitee (must exist so lookup succeeds and we reach insert path)
  const invitee = await createSignedInUser("invitee");

  // Owner creates a project
  const { data: project, error: pErr } = await admin
    .from("projects")
    .insert({ user_id: owner.userId, name: `OwnCheck ${Date.now()}` })
    .select("id")
    .single();
  if (pErr || !project) throw new Error(`project insert: ${pErr?.message}`);
  const projectId = project.id as string;

  try {
    // --- Scenario (b): attacker invites to owner's project -> 403 ---
    const before = await admin
      .from("project_invitations")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    const attackerRes = await invoke(attacker.jwt, {
      type: "project", targetId: projectId,
      invitedEmail: invitee.email, role: "member",
    });
    console.log("[attacker]", attackerRes.status, attackerRes.json);
    assertEquals(attackerRes.status, 403, `expected 403, got ${attackerRes.status}: ${attackerRes.text}`);
    assertEquals(attackerRes.json?.error, "forbidden");
    const afterAttack = await admin
      .from("project_invitations")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    assertEquals(afterAttack.count, before.count, "attacker must NOT create invitation row");

    // --- Scenario (a): owner invites to own project -> success ---
    const ownerRes = await invoke(owner.jwt, {
      type: "project", targetId: projectId,
      invitedEmail: invitee.email, role: "member",
    });
    console.log("[owner]", ownerRes.status, ownerRes.json);
    assertEquals(ownerRes.status, 200, `expected 200, got ${ownerRes.status}: ${ownerRes.text}`);
    assert(ownerRes.json?.success === true, "owner call should succeed");
    const afterOwner = await admin
      .from("project_invitations")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    assertEquals((afterOwner.count ?? 0), (before.count ?? 0) + 1, "owner must create exactly 1 invitation");
  } finally {
    // Cleanup
    await admin.from("project_invitations").delete().eq("project_id", projectId);
    await admin.from("projects").delete().eq("id", projectId);
    for (const u of [owner, attacker, invitee]) {
      await admin.auth.admin.deleteUser(u.userId).catch(() => {});
    }
  }
});
