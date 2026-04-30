// Called after Lifetime checkout completes — verifies payment in Stripe,
// records purchase in lifetime_purchases with the next Founding Member number.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LIFETIME_PRICE_ID = "price_1TRqXFQgkJI9PR8REDIWD7Wm";
const MAX_FOUNDING_MEMBERS = 200;

const log = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[VERIFY-LIFETIME] ${step}${d}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr) throw new Error(userErr.message);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");

    log("Verifying lifetime for user", { userId: user.id, email: user.email });

    // Already recorded?
    const { data: existing } = await adminClient
      .from("lifetime_purchases")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      log("Already recorded", { number: existing.founding_member_number });
      return new Response(
        JSON.stringify({ success: true, founding_member_number: existing.founding_member_number, alreadyExists: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });

    // Find paid checkout session for this user with Lifetime price
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) throw new Error("No Stripe customer");
    const customerId = customers.data[0].id;

    const sessions = await stripe.checkout.sessions.list({
      customer: customerId,
      limit: 20,
    });

    const lifetimeSession = sessions.data.find(
      (s) =>
        s.mode === "payment" &&
        s.payment_status === "paid" &&
        s.metadata?.checkout_type === "lifetime"
    );

    if (!lifetimeSession) {
      log("No paid lifetime session found");
      return new Response(JSON.stringify({ success: false, error: "No paid lifetime purchase found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify line item matches lifetime price
    const lineItems = await stripe.checkout.sessions.listLineItems(lifetimeSession.id);
    const hasLifetimePrice = lineItems.data.some((li) => li.price?.id === LIFETIME_PRICE_ID);
    if (!hasLifetimePrice) throw new Error("Session does not match lifetime price");

    // Check capacity
    const { data: countData } = await adminClient.rpc("get_founding_member_count");
    const currentCount = countData ?? 0;
    if (currentCount >= MAX_FOUNDING_MEMBERS) {
      log("Founding members capacity reached", { currentCount });
      // Refund? For now, return error — admin handles refund manually
      return new Response(JSON.stringify({ success: false, error: "Founding members capacity reached" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: nextNum } = await adminClient.rpc("get_next_founding_member_number");

    const { error: insertErr } = await adminClient.from("lifetime_purchases").insert({
      user_id: user.id,
      stripe_payment_intent_id: lifetimeSession.payment_intent as string,
      stripe_customer_id: customerId,
      founding_member_number: nextNum,
      amount_paid: lifetimeSession.amount_total ?? 12900,
      currency: lifetimeSession.currency ?? "eur",
    });

    if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);

    log("Lifetime recorded successfully", { number: nextNum });

    return new Response(
      JSON.stringify({ success: true, founding_member_number: nextNum }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
