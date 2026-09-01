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
    // Adresu anonimiziramo SAMO kad je račun stvarno obrisan.
    // Kod "failed" adresa ostaje — bez nje nemamo kome poslije javiti.
    ...(result.authDeleted ? { user_email: null } : {}),
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
      session_id: "cron:process-pending-deletions",
      user_id: null,
      event: "hard_delete_residual",
      severity: "warning",
      details: {
        message: `User ${userId} purge left ${result.residualScan.total} residual rows`,
        user_id: userId,
        residualScan: result.residualScan,
      },
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
      // Zapamti adresu PRIJE brisanja — nakon uspjeha adresa više ne postoji
      // (buildAuditUpdate upisuje user_email: null). Mail se NE šalje ovdje,
      // nego tek kad se zna ishod brisanja.
      const recipientEmail = log.user_email;

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

      const auditUpdate = buildAuditUpdate(purgeResult);

      // Upis u zapisnik ide PRIJE slanja maila — ako slanje padne,
      // zapisnik mora ostati točan i petlja mora ići dalje.
      await admin
        .from("account_deletion_log")
        .update(auditUpdate)
        .eq("id", log.id);

      await logResidualWarning(admin, log.user_id, purgeResult);

      // Mail tek NAKON što je ishod poznat: poruka "račun je obrisan"
      // smije ići samo kad je račun stvarno obrisan.
      const status = auditUpdate.status as string;
      if (status === "completed" || status === "completed_with_residuals") {
        await sendCompletionEmail(admin, { ...log, user_email: recipientEmail });
      } else {
        try {
          await admin.from("app_diagnostics_logs").insert({
            user_id: null,
            event_type: "account_deletion_not_completed",
            severity: "warning",
            message: `User ${log.user_id} deletion not completed (status: ${status})`,
            metadata: {
              user_id: log.user_id,
              status,
              blockedBy: purgeResult.blockedBy ?? null,
              errorCount: purgeResult.errors.length,
            },
          });
        } catch (e) {
          console.warn("[process-pending-deletions] not-completed log insert failed:", e);
        }
      }

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
