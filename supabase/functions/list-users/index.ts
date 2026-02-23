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

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const isAdmin = roles?.some((r: any) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List all users from auth
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });

    if (listError) {
      throw listError;
    }

    // Get profiles for display names
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, currency");

    const profileMap = new Map(
      profiles?.map((p: any) => [p.user_id, p]) || []
    );

    // Get last bug report device info per user
    const { data: bugReports } = await supabase
      .from("bug_reports")
      .select("user_id, device_info, created_at")
      .order("created_at", { ascending: false });

    const deviceMap = new Map<string, any>();
    bugReports?.forEach((r: any) => {
      if (!deviceMap.has(r.user_id)) {
        deviceMap.set(r.user_id, r.device_info);
      }
    });

    const result = users.map((u: any) => {
      const profile = profileMap.get(u.id);
      return {
        id: u.id,
        email: u.email,
        display_name: profile?.display_name || null,
        currency: profile?.currency || null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        confirmed_at: u.confirmed_at,
        user_metadata: u.user_metadata,
        app_metadata: u.app_metadata,
        last_device_info: deviceMap.get(u.id) || null,
      };
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
