// admin-hard-delete-user
// Internal admin-only entrypoint for hard-deleting a single test user via the
// shared purgeUser engine. Locked-down via 4 independent gates:
//   1. JWT validation
//   2. admin role check (user_roles)
//   3. ALLOW_HARD_DELETE env gate
//   4. hardcoded email allowlist + dual-confirmation (userId + email)
//
// See docs/HARD_DELETE.md for the foundation contract.

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { z } from "https://esm.sh/zod@3.23.8";
import { purgeUser } from "../_shared/purgeUser.ts";
import type { PurgeResult } from "../_shared/purgeUser.types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Allowlist (server-authoritative). Edit + redeploy to extend.
// ---------------------------------------------------------------------------
const ALLOWLIST_EMAILS: readonly string[] = ["vinkabalance@gmail.com"];
const ALLOWLIST_DOMAIN_SUFFIX = "@test.vmbalance.com";

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (!e) return false;
  if (ALLOWLIST_EMAILS.includes(e)) return true;
  if (e.endsWith(ALLOWLIST_DOMAIN_SUFFIX)) return true;
  return false;
}

const BodySchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logDiagnostic(
  admin: ReturnType<typeof createClient>,
  severity: "info" | "warning" | "error",
  message: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await admin.from("app_diagnostics_logs").insert({
      user_id: null,
      event_type: "admin_hard_delete",
      severity,
      message,
      metadata,
    });
  } catch (e) {
    console.warn("[admin-hard-delete-user] diag log failed:", e);
  }
}

function buildAuditUpdate(result: PurgeResult): Record<string, unknown> {
  if (result.blockedBy) {
    return {
      status: "blocked",
      error_message: `blocked_by:${result.blockedBy}`,
      tables_purged: {
        blocked: { reason: result.blockedBy, details: result.blockedDetails ?? {} },
      },
    };
  }
  const hasResiduals = result.residualScan.total > 0;
  const status = !result.authDeleted
    ? "failed"
    : hasResiduals
    ? "completed_with_residuals"
    : "completed";
  return {
    status,
    completed_at: new Date().toISOString(),
    stripe_subscription_cancelled: result.stripeSubscriptionCancelled,
    user_email: null, // anonymize after completion
    error_message: result.errors.length > 0 ? JSON.stringify(result.errors).slice(0, 500) : null,
    tables_purged: {
      tables: result.tablesPurged,
      storage: result.storagePurged,
      invitations: result.invitationsByEmail,
      residuals: result.residualScan,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // --- Gate 1: JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const token = authHeader.slice("Bearer ".length);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const requesterId = claimsData.claims.sub as string;

  // --- Gate 2: admin role
  const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
    _user_id: requesterId,
    _role: "admin",
  });
  if (roleErr || isAdmin !== true) {
    await logDiagnostic(admin, "warning", "non-admin attempted hard delete", {
      requesterId,
      roleErr: roleErr?.message,
    });
    return jsonResponse({ error: "forbidden" }, 403);
  }

  // --- Gate 3: env gate
  if (Deno.env.get("ALLOW_HARD_DELETE") !== "true") {
    await logDiagnostic(admin, "warning", "hard delete attempted while env gate disabled", {
      requesterId,
    });
    return jsonResponse({ error: "hard_delete_disabled" }, 403);
  }

  // --- Input parsing
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse(
      { error: "invalid_body", details: parsed.error.flatten().fieldErrors },
      400,
    );
  }
  const { userId, email } = parsed.data;
  const emailLc = email.trim().toLowerCase();

  // --- Gate 4a: allowlist
  if (!isEmailAllowed(emailLc)) {
    await logDiagnostic(admin, "warning", "email not in allowlist", {
      requesterId,
      targetUserId: userId,
      targetEmail: emailLc,
    });
    return jsonResponse({ error: "email_not_allowlisted" }, 403);
  }

  // --- Gate 4b: dual-confirmation (userId + email must match)
  const { data: userLookup, error: lookupErr } = await admin.auth.admin.getUserById(userId);
  if (lookupErr || !userLookup?.user) {
    return jsonResponse({ error: "user_not_found" }, 404);
  }
  const actualEmail = userLookup.user.email?.toLowerCase() ?? "";
  if (actualEmail !== emailLc) {
    await logDiagnostic(admin, "warning", "userId/email mismatch", {
      requesterId,
      targetUserId: userId,
      providedEmail: emailLc,
    });
    return jsonResponse({ error: "userid_email_mismatch" }, 409);
  }

  // --- Pre-audit row
  const { data: auditRow, error: auditInsertErr } = await admin
    .from("account_deletion_log")
    .insert({
      user_id: userId,
      user_email: emailLc,
      reason: `admin_hard_delete:${requesterId}`,
      status: "pending",
      scheduled_for: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (auditInsertErr) {
    return jsonResponse({ error: "audit_insert_failed", details: auditInsertErr.message }, 500);
  }

  // --- Execute purge
  let purgeResult: PurgeResult;
  try {
    purgeResult = await purgeUser(admin, {
      userId,
      userEmail: emailLc,
      policy: {
        sourceTag: "admin_hard_delete",
        allowKrugDestruction: true,
        deletePaidRecords: true,
        cancelStripeSubscription: true,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from("account_deletion_log")
      .update({
        status: "failed",
        error_message: msg.slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq("id", auditRow.id);
    await logDiagnostic(admin, "error", "purgeUser threw", {
      requesterId,
      targetUserId: userId,
      message: msg,
    });
    return jsonResponse({ status: "failed", error: msg }, 500);
  }

  // --- Post-audit update
  await admin
    .from("account_deletion_log")
    .update(buildAuditUpdate(purgeResult))
    .eq("id", auditRow.id);

  if (purgeResult.residualScan.total > 0) {
    await logDiagnostic(admin, "warning", `hard delete left ${purgeResult.residualScan.total} residual rows`, {
      requesterId,
      targetUserId: userId,
      residualScan: purgeResult.residualScan,
    });
  }

  if (purgeResult.blockedBy) {
    return jsonResponse(
      {
        status: "blocked",
        blockedBy: purgeResult.blockedBy,
        blockedDetails: purgeResult.blockedDetails ?? {},
      },
      200,
    );
  }
  if (!purgeResult.authDeleted) {
    return jsonResponse(
      { status: "failed", error: "auth_delete_failed", errors: purgeResult.errors },
      500,
    );
  }
  return jsonResponse(
    {
      status: "deleted",
      residualTotal: purgeResult.residualScan.total,
      residualScan: purgeResult.residualScan,
    },
    200,
  );
});
