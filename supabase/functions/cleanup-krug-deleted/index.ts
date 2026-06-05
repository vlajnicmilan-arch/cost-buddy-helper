// supabase/functions/cleanup-krug-deleted/index.ts
// Dnevni cron: trajno briše Krugove koji su soft-deletani prije više od 30 dana.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase.rpc("krug_purge_deleted", { p_older_than_days: 30 });
    if (error) throw error;

    await supabase.from("app_diagnostics_logs").insert({
      session_id: "cron-cleanup-krug-deleted",
      event: "krug_purge.completed",
      severity: "info",
      details: { purged_count: data },
    });

    return new Response(JSON.stringify({ success: true, purged_count: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    console.error("[cleanup-krug-deleted] error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
