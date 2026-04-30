import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tablice za brisanje (52). Redoslijed nije bitan jer ne koristimo FK na auth.users.
// Stavljamo account_deletion_log NA KRAJ (upisujemo status:completed prije nego ga obrišemo).
const TABLES_TO_PURGE = [
  "activation_nudge_log","app_diagnostics_logs","bank_connections","budget_members",
  "bug_reports","business_debts","business_premises","cash_registers","chat_messages",
  "clients","custom_categories","family_activity_log","family_members","family_messages",
  "income_source_members","installments","installment_plans","inventory_items","invoices",
  "milestone_budget_alerts","milestone_budget_revisions","milestone_checklist_items",
  "notification_preferences","notifications","payment_source_cards","payment_source_members",
  "project_activity_log","project_budget_revisions","project_estimates",
  "project_member_permissions","project_members","project_work_logs",
  "push_delivery_logs","push_tokens","recurring_transactions","reminders","savings_goals",
  "time_clock_entries","transaction_notes","travel_orders","user_login_logs","user_memories",
  "user_roles","user_subscriptions","transaction_notes","expenses",
  // Resursi koji su roditelji (obrisi nakon dependentne):
  "budget_plans","custom_payment_sources","family_groups","income_sources","projects",
  "business_profiles","profiles",
];

const STORAGE_BUCKETS = ["receipts","certificates","project-documents"];

async function purgeStorage(admin: any, userId: string): Promise<string[]> {
  const purged: string[] = [];
  for (const bucket of STORAGE_BUCKETS) {
    try {
      const { data: files } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
      if (files && files.length > 0) {
        const paths = files.map((f: any) => `${userId}/${f.name}`);
        await admin.storage.from(bucket).remove(paths);
        purged.push(`${bucket}: ${paths.length}`);
      }
    } catch (e) {
      console.warn(`[storage] ${bucket}:`, e);
    }
  }
  return purged;
}

async function cancelStripeSubscription(userEmail: string | null): Promise<boolean> {
  if (!userEmail) return false;
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return false;
  try {
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
    if (customers.data.length === 0) return false;
    const subs = await stripe.subscriptions.list({
      customer: customers.data[0].id, status: "active", limit: 10,
    });
    for (const sub of subs.data) {
      await stripe.subscriptions.cancel(sub.id);
    }
    return subs.data.length > 0;
  } catch (e) {
    console.error("[stripe]", e);
    return false;
  }
}

async function processOne(admin: any, log: any): Promise<{ ok: boolean; error?: string; tables?: string[] }> {
  const userId = log.user_id;
  const tablesPurged: string[] = [];

  try {
    // 1. Stripe
    const subCancelled = await cancelStripeSubscription(log.user_email);

    // 2. Storage
    const storagePurged = await purgeStorage(admin, userId);

    // 3. Database tables
    for (const table of [...new Set(TABLES_TO_PURGE)]) {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      if (error) {
        console.warn(`[purge ${table}]`, error.message);
      } else {
        tablesPurged.push(table);
      }
    }

    // 4. Auth user (zadnje)
    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr) throw new Error(`Auth delete failed: ${authErr.message}`);

    // 5. Mark completed (prije brisanja log retka, ali u ovom slučaju zadržavamo log za audit)
    // NAPOMENA: account_deletion_log NIJE u TABLES_TO_PURGE — zadržavamo ga 90 dana za GDPR audit.
    await admin.from("account_deletion_log").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      stripe_subscription_cancelled: subCancelled,
      tables_purged: { tables: tablesPurged, storage: storagePurged },
      user_email: null, // anonimiziraj email u logu
    }).eq("id", log.id);

    return { ok: true, tables: tablesPurged };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("account_deletion_log").update({
      status: "failed", error_message: msg,
    }).eq("id", log.id);
    return { ok: false, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Dohvati sve pending zahtjeve čiji je grace period prošao
    const { data: pending, error } = await admin
      .from("account_deletion_log")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .limit(50);

    if (error) throw error;

    const results = [];
    for (const log of pending ?? []) {
      const r = await processOne(admin, log);
      results.push({ user_id: log.user_id, ...r });
    }

    return new Response(JSON.stringify({
      processed: results.length,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[process-pending-deletions]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
