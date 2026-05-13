import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ebFetch } from "../_shared/enableBankingJwt.ts";

const REDIRECT_URI = `${Deno.env.get("SUPABASE_URL")}/functions/v1/bank-connect-complete`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claimsData?.claims?.sub;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { aspsp_name, aspsp_country, language = "en", psu_type = "personal" } = body;

    if (!aspsp_name || !aspsp_country) {
      return new Response(
        JSON.stringify({ error: "missing_fields", required: ["aspsp_name", "aspsp_country"] }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stateToken = crypto.randomUUID();

    // Create pending connection FIRST so we can validate state in callback
    const { error: insertErr } = await supabase
      .from("bank_connections")
      .insert({
        user_id: userId,
        provider: "enable_banking",
        bank_name: aspsp_name,
        aspsp_name,
        aspsp_country,
        state_token: stateToken,
        status: "pending",
      });

    if (insertErr) {
      console.error("[bank-connect-start] insert err", insertErr);
      return new Response(JSON.stringify({ error: "db_error", detail: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorize against Enable Banking
    const validUntil = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    const ebBody = {
      access: {
        valid_until: validUntil,
      },
      aspsp: { name: aspsp_name, country: aspsp_country },
      state: stateToken,
      redirect_url: REDIRECT_URI,
      psu_type,
      language,
    };

    const res = await ebFetch("/auth", {
      method: "POST",
      body: JSON.stringify(ebBody),
    });
    const text = await res.text();

    if (!res.ok) {
      console.error("[bank-connect-start] EB /auth error", res.status, text);
      await supabase
        .from("bank_connections")
        .update({ status: "failed", last_error: text.slice(0, 500) })
        .eq("state_token", stateToken);
      return new Response(
        JSON.stringify({ error: "enable_banking_error", status: res.status, detail: text }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = JSON.parse(text);
    return new Response(
      JSON.stringify({ authorization_url: data.url, state: stateToken }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[bank-connect-start] exception", err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
