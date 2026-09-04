// admin-delete-empty-user
//
// Admin-only tool for removing EMPTY accounts (accounts created by testing).
// Emptiness is decided EXCLUSIVELY on the server by the SQL function
// `admin_account_emptiness`, which derives the list of "content" tables from
// the live schema (every public table with a `user_id` column, minus a closed
// housekeeping list). The client never sends a table list nor a claim that an
// account is empty.
//
// Locks (all server-side):
//   1. valid JWT
//   2. caller must be admin (enforced inside the SQL function via _require_admin)
//   3. caller cannot delete themselves
//   4. caller cannot delete another admin
//   5. account must be empty (and free of an active paid subscription)
//   6. supplied email must match the target account's real email
//
// No cascade, no content deletion: if the account is not empty the answer is
// a refusal.

import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Blocker {
  table: string;
  count: number;
  kind?: string;
}

interface EmptinessReport {
  user_id: string;
  empty: boolean;
  blockers: Blocker[];
  is_admin: boolean;
  is_self: boolean;
  checked_tables: string[];
  checked_count: number;
  checked_at: string;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isUuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // --- Lock 1: JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const token = authHeader.slice("Bearer ".length);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) return json({ error: "unauthorized" }, 401);
  const requesterId = claimsData.claims.sub as string;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const mode = body.mode === "delete" ? "delete" : "check";
  const userId = body.userId;
  if (!isUuid(userId)) return json({ error: "invalid_body" }, 400);

  // --- Lock 2: admin (enforced by _require_admin inside the SQL function,
  // called with the CALLER's token, so auth.uid() is the caller).
  const { data: reportRaw, error: rpcErr } = await userClient.rpc("admin_account_emptiness", {
    p_user_id: userId,
  });
  if (rpcErr) {
    const forbidden = rpcErr.code === "42501" || /forbidden/i.test(rpcErr.message ?? "");
    return json({ error: forbidden ? "forbidden" : "check_failed", details: rpcErr.message },
      forbidden ? 403 : 500);
  }
  const report = reportRaw as unknown as EmptinessReport;

  // --- Locks 3 & 4
  if (report.is_self) return json({ error: "cannot_delete_self", report }, 403);
  if (report.is_admin) return json({ error: "cannot_delete_admin", report }, 403);

  if (mode === "check") return json({ status: "checked", report }, 200);

  // --- Lock 5
  if (!report.empty) return json({ error: "account_not_empty", report }, 409);

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return json({ error: "invalid_body" }, 400);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // --- Lock 6: supplied email must match the real account email
  const { data: lookup, error: lookupErr } = await admin.auth.admin.getUserById(userId);
  if (lookupErr || !lookup?.user) return json({ error: "user_not_found" }, 404);
  const actualEmail = lookup.user.email?.toLowerCase() ?? "";
  if (actualEmail !== email) return json({ error: "email_mismatch" }, 409);

  const nowIso = new Date().toISOString();
  const { data: auditRow, error: auditErr } = await admin
    .from("account_deletion_log")
    .insert({
      user_id: userId,
      user_email: actualEmail,
      deleted_by: requesterId,
      reason: "admin_delete_empty_account",
      status: "pending",
      requested_at: nowIso,
      scheduled_for: nowIso,
      tables_purged: {
        emptiness_proof: {
          empty: true,
          blockers: [],
          checked_count: report.checked_count,
          checked_tables: report.checked_tables,
          checked_at: report.checked_at,
        },
      },
    })
    .select("id")
    .single();
  if (auditErr) return json({ error: "audit_insert_failed", details: auditErr.message }, 500);

  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) {
    await admin
      .from("account_deletion_log")
      .update({ status: "failed", error_message: delErr.message.slice(0, 500), completed_at: new Date().toISOString() })
      .eq("id", auditRow.id);
    return json({ error: "auth_delete_failed", details: delErr.message }, 500);
  }

  await admin
    .from("account_deletion_log")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", auditRow.id);

  return json({ status: "deleted", userId, email: actualEmail }, 200);
});
