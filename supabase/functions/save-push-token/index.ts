import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) return json({ error: "Unauthorized" }, 401);

    const { data: authData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

    const { token, platform } = await req.json();
    if (typeof token !== "string" || token.length < 20) {
      return json({ error: "Invalid token" }, 400);
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("push_tokens").upsert(
      {
        user_id: authData.user.id,
        token,
        platform: typeof platform === "string" && platform ? platform : "android",
        last_used_at: now,
      },
      { onConflict: "token" },
    );

    if (error) throw error;

    return json({ ok: true });
  } catch (error) {
    console.error("[save-push-token]", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});