import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

const MODULES = ['smjer', 'krug', 'projekti', 'biznis'] as const;
type Module = typeof MODULES[number];

interface ModuleStatus {
  active: boolean;
  source: string | null;
  period_end: string | null;
}

async function loadEntitlements(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<Module, ModuleStatus>> {
  const nowIso = new Date().toISOString();
  const [{ data: rows }, ...checks] = await Promise.all([
    supabase
      .from('user_entitlements')
      .select('module, source, period_end, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .or(`period_end.is.null,period_end.gt.${nowIso}`),
    ...MODULES.map((m) =>
      supabase.rpc('has_entitlement', { _user_id: userId, _module: m }),
    ),
  ]);

  // Priority: paddle > admin > legacy > trial. A paid user with a lingering
  // trial row on the same module must be treated as PAID, otherwise
  // paddleActive downstream reads the trial source and returns subscribed=false.
  const sourceRank = (s: string | null | undefined): number => {
    if (s === 'paddle') return 4;
    if (s === 'admin') return 3;
    if (s === 'pro_legacy' || s === 'business_legacy') return 2;
    if (s === 'trial') return 1;
    return 0;
  };
  const pickBest = (mod: string) => {
    const candidates = (rows || []).filter((r: any) => r.module === mod);
    if (candidates.length === 0) return null;
    return candidates.sort((a: any, b: any) => sourceRank(b.source) - sourceRank(a.source))[0];
  };

  const result = {} as Record<Module, ModuleStatus>;
  MODULES.forEach((m, i) => {
    const activeRes = checks[i] as { data: unknown };
    const active = !!activeRes?.data;
    const direct = pickBest(m);
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

    const entitlements = await loadEntitlements(supabaseClient, user.id);
    logStep("Entitlements", entitlements);

    // Admin-assigned subscription (legacy tier fallback for Milan/Tactura admins)
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

    // Paddle entitlements — derived tier for backward-compat with tier consumers
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

    return jsonResponse({ subscribed: false, tier: "free", source: null, entitlements });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
