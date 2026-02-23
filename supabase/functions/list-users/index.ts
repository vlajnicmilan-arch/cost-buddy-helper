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

    // Parse pagination params
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const perPage = Math.min(parseInt(url.searchParams.get("perPage") || "50"), 100);

    // List users with pagination
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (listError) throw listError;

    // Get total count
    const { data: { users: allUsersForCount } } = await supabase.auth.admin.listUsers({ perPage: 1 });
    // Supabase returns total in the response metadata, but we approximate via stats


    // Get profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, currency");
    const profileMap = new Map(profiles?.map((p: any) => [p.user_id, p]) || []);

    // Get user roles
    const { data: allRoles } = await supabase.from("user_roles").select("user_id, role");
    const rolesMap = new Map<string, string[]>();
    allRoles?.forEach((r: any) => {
      const list = rolesMap.get(r.user_id) || [];
      list.push(r.role);
      rolesMap.set(r.user_id, list);
    });

    // Get latest login log per user (last device)
    const { data: loginLogs } = await supabase
      .from("user_login_logs")
      .select("user_id, device_info, logged_in_at")
      .order("logged_in_at", { ascending: false });

    const lastLoginMap = new Map<string, any>();
    loginLogs?.forEach((l: any) => {
      if (!lastLoginMap.has(l.user_id)) {
        lastLoginMap.set(l.user_id, l);
      }
    });

    // Get stats
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { count: totalExpenses } = await supabase.from("expenses").select("*", { count: "exact", head: true });
    const { count: expenses7d } = await supabase.from("expenses").select("*", { count: "exact", head: true }).gte("created_at", sevenDaysAgo);
    const { count: totalProjects } = await supabase.from("projects").select("*", { count: "exact", head: true });
    const { count: totalBudgets } = await supabase.from("budget_plans").select("*", { count: "exact", head: true });
    const { count: totalSavings } = await supabase.from("savings_goals").select("*", { count: "exact", head: true });
    const { count: bugReports } = await supabase.from("bug_reports").select("*", { count: "exact", head: true }).eq("status", "open");
    const { count: totalReferrals } = await supabase.from("referrals").select("*", { count: "exact", head: true });

    // Get referral data
    const { data: referrals } = await supabase.from("referrals").select("referrer_id, referred_user_id");
    const referralCountMap = new Map<string, number>();
    referrals?.forEach((r: any) => {
      referralCountMap.set(r.referrer_id, (referralCountMap.get(r.referrer_id) || 0) + 1);
    });
    // Active users (logged in within 7 days)
    const { data: activeLogins } = await supabase
      .from("user_login_logs")
      .select("user_id")
      .gte("logged_in_at", sevenDaysAgo);
    const activeUsers7d = new Set(activeLogins?.map((l: any) => l.user_id)).size;

    const { data: activeLogins30 } = await supabase
      .from("user_login_logs")
      .select("user_id")
      .gte("logged_in_at", thirtyDaysAgo);
    const activeUsers30d = new Set(activeLogins30?.map((l: any) => l.user_id)).size;

    const result = {
      users: users.map((u: any) => {
        const profile = profileMap.get(u.id);
        const lastLogin = lastLoginMap.get(u.id);
        return {
          id: u.id,
          email: u.email,
          display_name: profile?.display_name || null,
          currency: profile?.currency || null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          confirmed_at: u.confirmed_at,
          banned_until: u.banned_until,
          roles: rolesMap.get(u.id) || [],
          last_device_info: lastLogin?.device_info || null,
          last_login_at: lastLogin?.logged_in_at || null,
          referral_count: referralCountMap.get(u.id) || 0,
        };
      }),
      pagination: {
        page,
        perPage,
        hasMore: users.length === perPage,
      },
      stats: {
        total_users: users.length,
        active_users_7d: activeUsers7d,
        active_users_30d: activeUsers30d,
        total_expenses: totalExpenses || 0,
        expenses_7d: expenses7d || 0,
        total_projects: totalProjects || 0,
        total_budgets: totalBudgets || 0,
        total_savings: totalSavings || 0,
        open_bug_reports: bugReports || 0,
        total_referrals: totalReferrals || 0,
      },
    };

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
