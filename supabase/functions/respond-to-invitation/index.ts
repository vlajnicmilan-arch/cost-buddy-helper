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

    const { type, invitationId, action } = await req.json();

    if (!type || !invitationId || !action) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["accept", "decline"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const invitationTable = type === "project" ? "project_invitations" : "budget_invitations";
    const idColumn = type === "project" ? "project_id" : "budget_id";
    const memberTable = type === "project" ? "project_members" : "budget_members";

    // Get the invitation
    const { data: invitation, error: invitationError } = await adminClient
      .from(invitationTable)
      .select("*")
      .eq("id", invitationId)
      .eq("invited_user_id", user.id)
      .eq("status", "pending")
      .single();

    if (invitationError || !invitation) {
      return new Response(
        JSON.stringify({ error: "Invitation not found or already processed" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if invitation expired
    if (new Date(invitation.expires_at) < new Date()) {
      await adminClient
        .from(invitationTable)
        .update({ status: "expired" })
        .eq("id", invitationId);

      return new Response(
        JSON.stringify({ error: "Invitation has expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetId = invitation[idColumn];

    if (action === "accept") {
      // Get user's display name
      const { data: profile } = await adminClient
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .single();

      // Add user as a member
      const memberData: Record<string, unknown> = {
        [idColumn]: targetId,
        user_id: user.id,
        role: invitation.role,
      };

      // For project_members, add display_name
      if (type === "project") {
        memberData.display_name = profile?.display_name || null;
      }

      const { error: memberError } = await adminClient
        .from(memberTable)
        .insert(memberData);

      if (memberError) {
        console.error("Error adding member:", memberError);
        throw memberError;
      }

      // Update invitation status
      await adminClient
        .from(invitationTable)
        .update({ status: "accepted" })
        .eq("id", invitationId);

      // Notify the inviter
      const targetTable = type === "project" ? "projects" : "budget_plans";
      const { data: targetData } = await adminClient
        .from(targetTable)
        .select("name")
        .eq("id", targetId)
        .single();

      const targetName = targetData?.name || (type === "project" ? "Projekt" : "Budžet");
      const userName = profile?.display_name || "Korisnik";

      await adminClient
        .from("notifications")
        .insert({
          user_id: invitation.invited_by,
          type: "invitation_accepted",
          title: "Pozivnica prihvaćena",
          message: `${userName} je prihvatio/la pozivnicu za ${type === "project" ? "projekt" : "budžet"} "${targetName}"`,
          data: {
            target_id: targetId,
            target_name: targetName,
            type: type,
            user_id: user.id,
            user_name: userName,
          },
        });

      console.log(`User ${user.id} accepted invitation ${invitationId} for ${type} ${targetId}`);
    } else {
      // Decline the invitation
      await adminClient
        .from(invitationTable)
        .update({ status: "declined" })
        .eq("id", invitationId);

      console.log(`User ${user.id} declined invitation ${invitationId}`);
    }

    return new Response(
      JSON.stringify({ success: true, action }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("respond-to-invitation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
