import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

// Tier mapping by Stripe product ID (legacy — clients read entitlements instead)
const PRODUCT_TIER_MAP: Record<string, string> = {
  "prod_UBTAWWLxYO3scq": "pro",
  "prod_UBTAc9290C7uQe": "pro",
  "prod_UBTAN8sFLVf1N2": "business",
  "prod_UBTBILcRURGUH9": "business",
  "prod_UQhwRIN3xrL1un": "pro",
  "prod_UQhwBmBQxvlJRJ": "pro",
  "prod_UQhx0n6py0qQzu": "pro",
  "prod_UQhx2p8DiOL5gl": "business",
  "prod_UQhyXmdR9u8wS5": "business",
};

const MODULES = ['smjer', 'krug', 'projekti', 'biznis'] as const;
type Module = typeof MODULES[number];

interface ModuleStatus {
  active: boolean;
  source: string | null;
  period_end: string | null;
}

/**
 * FAZA 5 — build per-module entitlement status.
 * `active` je autoritativan (koristi RPC has_entitlement koji zna legacy mapiranja
 * i admin_module_grants). `source`/`period_end` su za UI (trial countdown i sl.).
 */
async function loadEntitlements(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<Module, ModuleStatus>> {
  const [{ data: rows }, ...checks] = await Promise.all([
    supabase
      .from('user_entitlements')
      .select('module, source, period_end, status')
      .eq('user_id', userId)
      .eq('status', 'active'),
    ...MODULES.map((m) =>
      supabase.rpc('has_entitlement', { _user_id: userId, _module: m }),
    ),
  ]);

  const result = {} as Record<Module, ModuleStatus>;
  MODULES.forEach((m, i) => {
    const activeRes = checks[i] as { data: unknown };
    const active = !!activeRes?.data;
    const direct = (rows || []).find((r: any) => r.module === m);
    const legacy = (rows || []).find((r: any) =>
      (m !== 'biznis' && r.module === 'pro_legacy') || r.module === 'business_legacy'
    );
    const chosen = direct || legacy || null;
    result[m] = {
      active,
      source: chosen?.source ?? null,
      period_end: chosen?.period_end ?? null,
    };
  });
  return result;
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // FAZA 5: uvijek uključujemo entitlements — klijent bira što će čitati.
    const entitlements = await loadEntitlements(supabaseClient, user.id);
    logStep("Entitlements", entitlements);

    // Check for admin-assigned subscription first (legacy)
    const { data: adminSub } = await supabaseClient
      .from("user_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminSub && adminSub.tier !== "free") {
      if (!adminSub.expires_at || new Date(adminSub.expires_at) > new Date()) {
        logStep("Admin-assigned subscription found", { tier: adminSub.tier });
        return jsonResponse({
          subscribed: true,
          tier: adminSub.tier,
          subscription_end: adminSub.expires_at,
          source: "admin",
          entitlements,
        });
      }
    }

    // Lifetime Pro
    const { data: lifetime } = await supabaseClient
      .from("lifetime_purchases")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (lifetime) {
      logStep("Lifetime Pro purchase found", { foundingMember: lifetime.founding_member_number });
      try {
        await supabaseClient.from('funnel_events').insert({
          user_id: user.id,
          event_name: 'paid_conversion',
          platform: 'lifetime',
          metadata: { tier: 'pro', source: 'lifetime', founding_member_number: lifetime.founding_member_number } as any,
        });
      } catch (e) {
        logStep("funnel insert skipped", { reason: (e as Error)?.message });
      }
      return jsonResponse({
        subscribed: true,
        tier: "pro",
        subscription_end: null,
        source: "lifetime",
        founding_member_number: lifetime.founding_member_number,
        entitlements,
      });
    }

    // FAZA 5: ako imamo Paddle entitlement, izvedeni tier za backward-compat
    const paddleActive = MODULES.some(
      (m) => entitlements[m].active && entitlements[m].source === 'paddle',
    );
    if (paddleActive) {
      const tier = entitlements.biznis.active ? 'business' : 'pro';
      logStep("Paddle entitlement resolved", { tier });
      return jsonResponse({
        subscribed: true,
        tier,
        subscription_end: entitlements.smjer.period_end ?? entitlements.projekti.period_end ?? null,
        source: "paddle",
        entitlements,
      });
    }

    // Stripe (legacy fallback — održava postojeće plaćene korisnike dok Paddle ne preuzme)
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      logStep("STRIPE_SECRET_KEY missing — returning entitlements-only");
      return jsonResponse({ subscribed: false, tier: "free", source: null, entitlements });
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      logStep("No Stripe customer found");
      return jsonResponse({ subscribed: false, tier: "free", source: null, entitlements });
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
      return jsonResponse({ subscribed: false, tier: "free", source: null, entitlements });
    }

    const subscription = subscriptions.data[0];
    const productId = subscription.items.data[0].price.product as string;
    const tier = PRODUCT_TIER_MAP[productId] || "pro";
    const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();

    logStep("Active subscription found", { tier, subscriptionEnd });

    try {
      await supabaseClient.from('funnel_events').insert({
        user_id: user.id,
        event_name: 'paid_conversion',
        platform: 'stripe',
        metadata: { tier, source: 'stripe', product_id: productId } as any,
      });
    } catch (e) {
      logStep("funnel insert skipped", { reason: (e as Error)?.message });
    }

    return jsonResponse({
      subscribed: true,
      tier,
      subscription_end: subscriptionEnd,
      source: "stripe",
      entitlements,
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
