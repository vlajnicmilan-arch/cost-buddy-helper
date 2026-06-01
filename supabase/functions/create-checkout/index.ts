import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { captureEdgeError } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { email: user.email });

    const { priceId, mode } = await req.json();
    if (!priceId) throw new Error("Price ID is required");
    const checkoutMode = mode === "payment" ? "payment" : "subscription";
    logStep("Price ID received", { priceId, mode: checkoutMode });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing customer found", { customerId });
    }

    // SECURITY: Stripe success/cancel URLs must come from a fixed allowlist, not
    // a client-controlled Origin header (otherwise a forged request could redirect
    // a logged-in user back through an attacker-controlled domain).
    const ALLOWED_ORIGINS = new Set([
      "https://vmbalance.com",
      "https://www.vmbalance.com",
      "https://cost-buddy-helper.lovable.app",
      "https://id-preview--8a8fc612-0ac2-4902-a82e-29b5b800bc32.lovable.app",
    ]);
    const requestedOrigin = req.headers.get("origin") || "";
    const origin = ALLOWED_ORIGINS.has(requestedOrigin)
      ? requestedOrigin
      : "https://vmbalance.com";
    logStep("Resolved checkout origin", { requestedOrigin, origin, allowed: ALLOWED_ORIGINS.has(requestedOrigin) });

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: checkoutMode,
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
      metadata: { user_id: user.id, checkout_type: checkoutMode === "payment" ? "lifetime" : "subscription" },
    });

    logStep("Checkout session created", { sessionId: session.id });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    captureEdgeError(error, {
      functionName: 'create-checkout',
      context: { method: req.method },
    });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
