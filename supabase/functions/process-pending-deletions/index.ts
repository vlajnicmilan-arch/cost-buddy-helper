// process-pending-deletions
// Cron-triggered processor for accounts whose 30-day grace period has elapsed.
// Thin wrapper over the shared purgeUser engine — single source of truth for
// "fully deleted user" lives in supabase/functions/_shared/.
//
// Foundation pass: this function NO LONGER hardcodes the purge list. See
// docs/HARD_DELETE.md for the canonical model and rationale.

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { purgeUser } from "../_shared/purgeUser.ts";
import type { PurgeResult } from "../_shared/purgeUser.types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendCompletionEmail(admin: any, log: any): Promise<void> {
  if (!log.user_email) return;
  try {
    await admin.functions.invoke("send-transactional-email", {
      body: {
        templateName: "account-deletion-completed",
        recipientEmail: log.user_email,
        idempotencyKey: `deletion-completed-${log.id}`,
      },
    });
  } catch (e) {
    console.error("[process-pending-deletions] completion email failed:", e);
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
    user_email: null, // anonymize email in audit row
    error_message: result.errors.length > 0 ? JSON.stringify(result.errors).slice(0, 500) : null,
    tables_purged: {
      tables: result.tablesPurged,
      storage: result.storagePurged,
      invitations: result.invitationsByEmail,
      residuals: result.residualScan,
    },
  };
}

async function logResidualWarning(admin: any, userId: string, result: PurgeResult): Promise<void> {
  if (result.residualScan.total === 0) return;
  try {
    await admin.from("app_diagnostics_logs").insert({
      user_id: null,
      event_type: "hard_delete_residual",
      severity: "warning",
      message: `User ${userId} purge left ${result.residualScan.total} residual rows`,
      metadata: result.residualScan,
    });
  } catch (e) {
    console.warn("[process-pending-deletions] residual log insert failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: pending, error } = await admin
      .from("account_deletion_log")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .limit(50);
    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];
    for (const log of pending ?? []) {
      // Notify BEFORE purge — email is gone afterwards.
      await sendCompletionEmail(admin, log);

      const purgeResult = await purgeUser(admin, {
        userId: log.user_id,
        userEmail: log.user_email,
        policy: {
          sourceTag: "cron_grace",
          // Cron path stays conservative: never destroy multi-member krugs,
          // never silently delete paid records. Admin can override later.
          allowKrugDestruction: false,
          deletePaidRecords: false,
          
        },
      });

      await admin
        .from("account_deletion_log")
        .update(buildAuditUpdate(purgeResult))
        .eq("id", log.id);

      await logResidualWarning(admin, log.user_id, purgeResult);

      results.push({
        user_id: log.user_id,
        ok: purgeResult.ok,
        blockedBy: purgeResult.blockedBy ?? null,
        residualTotal: purgeResult.residualScan.total,
        errors: purgeResult.errors.length,
      });
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[process-pending-deletions]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
