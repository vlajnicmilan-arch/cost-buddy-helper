// Map a bank_account to a custom_payment_source (or create a new one and map).
// Auth: requires JWT (verify_jwt = false in config.toml, validated in code).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

interface Body {
  bank_account_id: string;
  payment_source_id?: string | null;
  create_new?: { name: string; currency?: string; type?: string } | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "missing_auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = (await req.json()) as Body;
    if (!body?.bank_account_id) {
      return new Response(JSON.stringify({ error: "missing_bank_account_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Verify ownership
    const { data: account, error: accErr } = await admin
      .from("bank_accounts")
      .select("id, user_id, business_profile_id, currency, name")
      .eq("id", body.bank_account_id)
      .maybeSingle();

    if (accErr || !account) {
      return new Response(JSON.stringify({ error: "account_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (account.user_id !== userId) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let paymentSourceId = body.payment_source_id ?? null;

    // Create new payment source if requested
    if (body.create_new && !paymentSourceId) {
      // Compute next sort_order
      const { data: existing } = await admin
        .from("custom_payment_sources")
        .select("sort_order")
        .eq("user_id", userId)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = ((existing?.[0]?.sort_order as number) ?? -1) + 1;

      const { data: newSource, error: createErr } = await admin
        .from("custom_payment_sources")
        .insert({
          user_id: userId,
          name: body.create_new.name,
          currency: body.create_new.currency ?? account.currency ?? "EUR",
          business_profile_id: account.business_profile_id,
          sort_order: nextOrder,
        })
        .select("id")
        .single();

      if (createErr || !newSource) {
        console.error("[bank-link-account] create source failed", createErr);
        return new Response(JSON.stringify({ error: "create_source_failed", details: createErr?.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      paymentSourceId = newSource.id;
    }

    // Update mapping (paymentSourceId may be null to unlink)
    const { error: updErr } = await admin
      .from("bank_accounts")
      .update({ linked_payment_source_id: paymentSourceId })
      .eq("id", body.bank_account_id);

    if (updErr) {
      console.error("[bank-link-account] update failed", updErr);
      return new Response(JSON.stringify({ error: "update_failed", details: updErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      bank_account_id: body.bank_account_id,
      payment_source_id: paymentSourceId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[bank-link-account] exception", err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
