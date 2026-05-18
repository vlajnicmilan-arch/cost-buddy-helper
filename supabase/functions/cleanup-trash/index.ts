// supabase/functions/cleanup-trash/index.ts
// Dnevni cron: trajno briše stavke iz koša starije od 30 dana.
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

    const { data, error } = await supabase.rpc("purge_old_trash", { p_older_than_days: 30 });
    if (error) throw error;

    // Log u app_diagnostics_logs
    await supabase.from("app_diagnostics_logs").insert({
      session_id: "cron-cleanup-trash",
      event: "cleanup_trash.purged",
      severity: "info",
      details: data,
    });

    return new Response(JSON.stringify({ success: true, result: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    console.error("[cleanup-trash] error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
