import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[SEND-MEMBER-INVITATION] Processing request...");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { type, targetId, invitedEmail, role, suggestedContext } = body;
    console.log("[SEND-MEMBER-INVITATION] Request body:", { type, targetId, invitedEmail, role, suggestedContext });

    if (!type || !targetId || !invitedEmail || !role) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Find user by email
    console.log("[SEND-MEMBER-INVITATION] Looking up user by email...");
    const { data: usersData, error: listUsersError } = await adminClient.auth.admin.listUsers();
    if (listUsersError) {
      console.error("[SEND-MEMBER-INVITATION] listUsers error:", listUsersError);
    }
    console.log("[SEND-MEMBER-INVITATION] Found", usersData?.users?.length || 0, "users");
    const invitedUser = usersData?.users.find(u => u.email?.toLowerCase() === invitedEmail.toLowerCase());

    if (!invitedUser) {
      return new Response(
        JSON.stringify({ error: "user_not_found", message: "Korisnik s tim emailom nije pronađen u sustavu" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine tables based on type
    let memberTable: string;
    let idColumn: string;
    let invitationTable: string;
    let targetTable: string;
    let targetLabel: string;

    if (type === "project") {
      memberTable = "project_members";
      idColumn = "project_id";
      invitationTable = "project_invitations";
      targetTable = "projects";
      targetLabel = "projektu";
    } else if (type === "budget") {
      memberTable = "budget_members";
      idColumn = "budget_id";
      invitationTable = "budget_invitations";
      targetTable = "budget_plans";
      targetLabel = "budžetu";
    } else if (type === "payment_source") {
      memberTable = "payment_source_members";
      idColumn = "payment_source_id";
      invitationTable = "payment_source_invitations";
      targetTable = "custom_payment_sources";
      targetLabel = "računu";
    } else if (type === "family") {
      memberTable = "family_members";
      idColumn = "group_id";
      invitationTable = "family_invitations";
      targetTable = "family_groups";
      targetLabel = "obiteljskoj grupi";
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is already a member
    const { data: existingMember } = await adminClient
      .from(memberTable)
      .select("id")
      .eq(idColumn, targetId)
      .eq("user_id", invitedUser.id)
      .single();

    if (existingMember) {
      return new Response(
        JSON.stringify({ error: "already_member", message: "Korisnik je već član" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for existing pending invitation
    const { data: existingInvitation } = await adminClient
      .from(invitationTable)
      .select("id")
      .eq(idColumn, targetId)
      .eq("invited_user_id", invitedUser.id)
      .eq("status", "pending")
      .single();

    if (existingInvitation) {
      return new Response(
        JSON.stringify({ error: "already_invited", message: "Korisnik već ima aktivnu pozivnicu" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get target name
    const { data: targetData } = await adminClient
      .from(targetTable)
      .select("name")
      .eq("id", targetId)
      .single();

    const targetName = targetData?.name || "Resurs";

    // Get inviter's name
    const { data: inviterProfile } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single();

    const inviterName = inviterProfile?.display_name || "Netko";

    // Create the invitation
    const insertData: Record<string, unknown> = {
      [idColumn]: targetId,
      email: invitedEmail.toLowerCase(),
      invited_user_id: invitedUser.id,
      role: role,
      invited_by: user.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    // For project invitations, add suggested context (personal | business)
    if (type === "project" && suggestedContext) {
      insertData.suggested_context = suggestedContext === "business" ? "business" : "personal";
    }

    // All invitation types now store invited_user_id for proper RLS scoping
    // (project, budget, payment_source all support invited_user_id column)

    const { data: invitation, error: invitationError } = await adminClient
      .from(invitationTable)
      .insert(insertData)
      .select()
      .single();

    if (invitationError) {
      console.error("Error creating invitation:", invitationError);
      throw invitationError;
    }

    // Create notification for the invited user
    const notificationTypeMap: Record<string, string> = {
      project: "project_invitation",
      budget: "budget_invitation",
      payment_source: "payment_source_invitation",
      family: "family_invitation",
    };

    const titleMap: Record<string, string> = {
      project: "Pozivnica za projekt",
      budget: "Pozivnica za budžet",
      payment_source: "Pozivnica za dijeljeni račun",
      family: "Pozivnica za obiteljsku grupu",
    };

    const { error: notificationError } = await adminClient
      .from("notifications")
      .insert({
        user_id: invitedUser.id,
        type: notificationTypeMap[type],
        title: titleMap[type],
        message: `${inviterName} vas poziva da se pridružite ${targetLabel} "${targetName}"`,
        data: {
          invitation_id: invitation.id,
          target_id: targetId,
          target_name: targetName,
          role: role,
          invited_by: user.id,
          inviter_name: inviterName,
          type: type,
        },
      });

    if (notificationError) {
      console.error("Error creating notification:", notificationError);
    }

    console.log(`Invitation sent to ${invitedEmail} for ${type} ${targetId}`);

    return new Response(
      JSON.stringify({ success: true, invitation }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-member-invitation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
