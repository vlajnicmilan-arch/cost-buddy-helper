import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

// Tier mapping by Stripe product ID
const PRODUCT_TIER_MAP: Record<string, string> = {
  // Legacy (€4.99 / €9.99) — kept for users not yet migrated
  "prod_UBTAWWLxYO3scq": "pro",
  "prod_UBTAc9290C7uQe": "pro",
  "prod_UBTAN8sFLVf1N2": "business",
  "prod_UBTBILcRURGUH9": "business",
  // New pricing (€7.99 / €14.99 / €129 lifetime)
  "prod_UQhwRIN3xrL1un": "pro",      // Pro Monthly
  "prod_UQhwBmBQxvlJRJ": "pro",      // Pro Yearly
  "prod_UQhx0n6py0qQzu": "pro",      // Pro Lifetime
  "prod_UQhx2p8DiOL5gl": "business", // Business Monthly
  "prod_UQhyXmdR9u8wS5": "business", // Business Yearly
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Check for admin-assigned subscription first
    const { data: adminSub } = await supabaseClient
      .from("user_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminSub && adminSub.tier !== "free") {
      // Check expiry
      if (!adminSub.expires_at || new Date(adminSub.expires_at) > new Date()) {
        logStep("Admin-assigned subscription found", { tier: adminSub.tier });
        return new Response(JSON.stringify({
          subscribed: true,
          tier: adminSub.tier,
          subscription_end: adminSub.expires_at,
          source: "admin",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // Check for Lifetime Pro purchase (one-time payment)
    const { data: lifetime } = await supabaseClient
      .from("lifetime_purchases")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (lifetime) {
      logStep("Lifetime Pro purchase found", { foundingMember: lifetime.founding_member_number });
      return new Response(JSON.stringify({
        subscribed: true,
        tier: "pro",
        subscription_end: null,
        source: "lifetime",
        founding_member_number: lifetime.founding_member_number,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Check Stripe subscription
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      logStep("No Stripe customer found");
      return new Response(JSON.stringify({ subscribed: false, tier: "free" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      logStep("No active subscription");
      return new Response(JSON.stringify({ subscribed: false, tier: "free" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const subscription = subscriptions.data[0];
    const productId = subscription.items.data[0].price.product as string;
    const tier = PRODUCT_TIER_MAP[productId] || "pro";
    const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();

    logStep("Active subscription found", { tier, subscriptionEnd });

    return new Response(JSON.stringify({
      subscribed: true,
      tier,
      subscription_end: subscriptionEnd,
      source: "stripe",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
