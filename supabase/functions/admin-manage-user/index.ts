import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabase.auth.getUser(token);
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    if (!roles?.some((r: any) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, userId, role } = await req.json();

    if (action === "ban") {
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        ban_duration: "876600h", // ~100 years
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, message: "User banned" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unban") {
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        ban_duration: "none",
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, message: "User unbanned" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "add_role") {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, message: "Role added" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "remove_role") {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, message: "Role removed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_password") {
      const { password } = await req.json().catch(() => ({ password: undefined }));
      const body = await req.text().catch(() => "");
      // Already parsed above, re-parse from original
      const parsed = JSON.parse(body || "{}");
      const newPassword = parsed.password;
      if (!newPassword || newPassword.length < 6) {
        return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        password: newPassword,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, message: "Password updated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
