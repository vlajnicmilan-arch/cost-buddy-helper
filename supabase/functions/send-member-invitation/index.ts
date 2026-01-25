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

    // Verify the user
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

    const { type, targetId, invitedEmail, role } = await req.json();

    if (!type || !targetId || !invitedEmail || !role) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Find user by email (check profiles table)
    const { data: invitedProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("user_id, display_name")
      .eq("user_id", (
        await adminClient.auth.admin.listUsers()
      ).data.users.find(u => u.email === invitedEmail.toLowerCase())?.id || "")
      .single();

    // Alternative: search users directly
    const { data: usersData } = await adminClient.auth.admin.listUsers();
    const invitedUser = usersData?.users.find(u => u.email?.toLowerCase() === invitedEmail.toLowerCase());

    if (!invitedUser) {
      return new Response(
        JSON.stringify({ error: "user_not_found", message: "Korisnik s tim emailom nije pronađen u sustavu" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is already a member
    const memberTable = type === "project" ? "project_members" : "budget_members";
    const idColumn = type === "project" ? "project_id" : "budget_id";
    
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
    const invitationTable = type === "project" ? "project_invitations" : "budget_invitations";
    
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

    // Get target name (project or budget name)
    const targetTable = type === "project" ? "projects" : "budget_plans";
    const { data: targetData } = await adminClient
      .from(targetTable)
      .select("name")
      .eq("id", targetId)
      .single();

    const targetName = targetData?.name || (type === "project" ? "Projekt" : "Budžet");

    // Get inviter's name
    const { data: inviterProfile } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single();

    const inviterName = inviterProfile?.display_name || "Netko";

    // Create the invitation
    const { data: invitation, error: invitationError } = await adminClient
      .from(invitationTable)
      .insert({
        [idColumn]: targetId,
        email: invitedEmail.toLowerCase(),
        invited_user_id: invitedUser.id,
        role: role,
        invited_by: user.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      })
      .select()
      .single();

    if (invitationError) {
      console.error("Error creating invitation:", invitationError);
      throw invitationError;
    }

    // Create notification for the invited user
    const notificationType = type === "project" ? "project_invitation" : "budget_invitation";
    const { error: notificationError } = await adminClient
      .from("notifications")
      .insert({
        user_id: invitedUser.id,
        type: notificationType,
        title: type === "project" ? "Pozivnica za projekt" : "Pozivnica za budžet",
        message: `${inviterName} vas poziva da se pridružite ${type === "project" ? "projektu" : "budžetu"} "${targetName}"`,
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
