import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // One-time use: hardcoded for this specific reset
  const targetUserId = "6566285d-0e5d-422e-adaf-4ed6fdcf95a8";
  const newPassword = "VmBalance2024!";

  const { error } = await supabase.auth.admin.updateUserById(targetUserId, {
    password: newPassword,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, message: "Password reset to VmBalance2024!" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
