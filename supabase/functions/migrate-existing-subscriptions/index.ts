// ADMIN-ONLY: Migrates all existing active Stripe subscriptions from legacy
// price IDs (€4.99 / €9.99) to new ones (€7.99 / €14.99).
//
// Behavior:
//   - dryRun=true (default) → returns a list of what WOULD be migrated, no changes
//   - dryRun=false → actually updates subscriptions with `proration_behavior: 'create_prorations'`
//   - logs every migration to subscription_migration_log
//
// IMPORTANT: This runs on-demand from admin UI. Email notifications are queued
// separately (7 days advance notice required by EU consumer law).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Legacy → New price ID mapping
const PRICE_MIGRATION_MAP: Record<string, string> = {
  // Pro
  "price_1TD6DlQgkJI9PR8R4jEk7Utl": "price_1TRqWGQgkJI9PR8RdCKznBRn", // monthly: 4.99 → 7.99
  "price_1TD6EGQgkJI9PR8RjbeLZKYj": "price_1TRqWtQgkJI9PR8RclGTn1J7", // yearly: 49.99 → 71.90
  // Business
  "price_1TD6EbQgkJI9PR8RmCd14trv": "price_1TRqXyQgkJI9PR8Ruw1LnRKi", // monthly: 9.99 → 14.99
  "price_1TD6ExQgkJI9PR8R0JnN7Vwx": "price_1TRqYOQgkJI9PR8RQbGqnA9I", // yearly: 99.99 → 134.90
};

const log = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[MIGRATE-SUBS] ${step}${d}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    // Auth check — only admins
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr) throw new Error(userErr.message);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // default true

    log("Starting migration", { dryRun });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const results: any[] = [];
    const errors: any[] = [];

    // Iterate over each legacy price → fetch all active subs on it
    for (const [oldPriceId, newPriceId] of Object.entries(PRICE_MIGRATION_MAP)) {
      let hasMore = true;
      let startingAfter: string | undefined;

      while (hasMore) {
        const subs = await stripe.subscriptions.list({
          price: oldPriceId,
          status: "active",
          limit: 100,
          starting_after: startingAfter,
        });

        for (const sub of subs.data) {
          const item = sub.items.data.find((i) => i.price.id === oldPriceId);
          if (!item) continue;

          const oldAmount = item.price.unit_amount ?? 0;
          const customerEmail = typeof sub.customer === "string"
            ? null
            : (sub.customer as Stripe.Customer)?.email ?? null;

          const result = {
            subscription_id: sub.id,
            customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
            customer_email: customerEmail,
            old_price_id: oldPriceId,
            new_price_id: newPriceId,
            old_amount_cents: oldAmount,
          };

          if (dryRun) {
            results.push({ ...result, action: "would_migrate" });
            continue;
          }

          try {
            await stripe.subscriptions.update(sub.id, {
              items: [{ id: item.id, price: newPriceId }],
              proration_behavior: "create_prorations",
              metadata: {
                ...sub.metadata,
                migrated_from: oldPriceId,
                migrated_at: new Date().toISOString(),
              },
            });

            // Find user_id from customer email
            let userId: string | null = null;
            if (customerEmail) {
              const { data: authUsers } = await adminClient.auth.admin.listUsers();
              const matchingUser = authUsers?.users?.find((u) => u.email === customerEmail);
              userId = matchingUser?.id ?? null;
            }

            await adminClient.from("subscription_migration_log").insert({
              user_id: userId ?? "00000000-0000-0000-0000-000000000000",
              stripe_customer_id: result.customer_id,
              stripe_subscription_id: sub.id,
              old_price_id: oldPriceId,
              new_price_id: newPriceId,
              old_amount_cents: oldAmount,
              new_amount_cents: oldPriceId.includes("DlQ") ? 799
                : oldPriceId.includes("EGQ") ? 7190
                : oldPriceId.includes("EbQ") ? 1499
                : 13490,
              status: "success",
            });

            results.push({ ...result, action: "migrated" });
            log("Migrated subscription", { subId: sub.id });
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            errors.push({ ...result, error: errMsg });
            await adminClient.from("subscription_migration_log").insert({
              user_id: "00000000-0000-0000-0000-000000000000",
              stripe_customer_id: result.customer_id,
              stripe_subscription_id: sub.id,
              old_price_id: oldPriceId,
              new_price_id: newPriceId,
              old_amount_cents: oldAmount,
              status: "failed",
              error_message: errMsg,
            });
          }
        }

        hasMore = subs.has_more;
        if (hasMore && subs.data.length > 0) {
          startingAfter = subs.data[subs.data.length - 1].id;
        }
      }
    }

    log("Migration complete", { migrated: results.length, errors: errors.length });

    return new Response(
      JSON.stringify({
        dryRun,
        total: results.length,
        migrated: results,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
