import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPushNotification } from "../_shared/sendPushNotification.ts";
import { translate } from "../_shared/i18n/index.ts";
import { isValidInvitationEmail } from "../_shared/invitationOutcome.ts";

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
    const { type, targetId, invitedEmail, role, suggestedContext, defaultPermissions, workerId, sendEmail } = body;
    console.log("[SEND-MEMBER-INVITATION] Request body:", { type, targetId, invitedEmail, role, suggestedContext, defaultPermissions, workerId, sendEmail });

    if (!type || !targetId || !invitedEmail || !role) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Basic email validation (shared with classifyInvitationOutcome helper)
    if (!isValidInvitationEmail(invitedEmail)) {
      return new Response(
        JSON.stringify({ error: "invalid_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Find user by email via SECURITY DEFINER RPC (avoids 50-row listUsers pagination bug)
    console.log("[SEND-MEMBER-INVITATION] Looking up user by email via RPC...");
    const { data: invitedUserId, error: lookupError } = await adminClient
      .rpc("find_user_by_email", { p_email: invitedEmail.toLowerCase() });
    if (lookupError) {
      console.error("[SEND-MEMBER-INVITATION] find_user_by_email error:", lookupError);
    }
    let invitedUser: { id: string; email: string } | null = null;
    if (invitedUserId) {
      const { data: userRow } = await adminClient.auth.admin.getUserById(invitedUserId);
      if (userRow?.user) {
        invitedUser = { id: userRow.user.id, email: userRow.user.email || invitedEmail };
      }
    }

    const isNewUser = !invitedUser;

    // For project worker invitations we allow inviting users that don't exist yet —
    // we'll create an email-only invitation row (invited_user_id = NULL) and send the
    // invite link via email. For other types, keep the previous behavior.
    if (!invitedUser && !(type === "project" && (workerId || sendEmail))) {
      return new Response(
        JSON.stringify({ error: "user_not_found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Block invitations to closed/archived projects
    if (type === "project") {
      const { data: projectRow, error: projectErr } = await adminClient
        .from("projects")
        .select("status, archived_at")
        .eq("id", targetId)
        .maybeSingle();
      if (projectErr || !projectRow) {
        return new Response(
          JSON.stringify({ error: "project_not_found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (
        projectRow.archived_at !== null ||
        projectRow.status === "completed" ||
        projectRow.status === "cancelled"
      ) {
        return new Response(
          JSON.stringify({ error: "project_closed" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check if user is already a member (only when they exist in the system)
    if (invitedUser) {
      const { data: existingMember } = await adminClient
        .from(memberTable)
        .select("id")
        .eq(idColumn, targetId)
        .eq("user_id", invitedUser.id)
        .maybeSingle();

      if (existingMember) {
        return new Response(
          JSON.stringify({ error: "already_member" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check for existing pending invitation
      const { data: existingInvitation } = await adminClient
        .from(invitationTable)
        .select("id")
        .eq(idColumn, targetId)
        .eq("invited_user_id", invitedUser.id)
        .eq("status", "pending")
        .maybeSingle();

      if (existingInvitation) {
        return new Response(
          JSON.stringify({ error: "already_invited" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // For email-only invites, check there isn't already a pending invite for the same email
      const { data: existingEmailInvite } = await adminClient
        .from(invitationTable)
        .select("id")
        .eq(idColumn, targetId)
        .eq("email", invitedEmail.toLowerCase())
        .eq("status", "pending")
        .maybeSingle();

      if (existingEmailInvite) {
        return new Response(
          JSON.stringify({ error: "already_invited" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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
      invited_user_id: invitedUser?.id ?? null,
      role: role,
      invited_by: user.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    // For project invitations, add suggested context, default permissions, optional worker_id
    if (type === "project") {
      if (suggestedContext) {
        insertData.suggested_context = suggestedContext === "business" ? "business" : "personal";
      }
      if (defaultPermissions && typeof defaultPermissions === "object") {
        insertData.default_permissions = defaultPermissions;
      }
      if (workerId) {
        insertData.worker_id = workerId;
      }
    }

    const { data: invitation, error: invitationError } = await adminClient
      .from(invitationTable)
      .insert(insertData)
      .select()
      .single();

    if (invitationError) {
      console.error("Error creating invitation:", invitationError);
      throw invitationError;
    }

    const notificationTypeMap: Record<string, string> = {
      project: "project_invitation",
      budget: "budget_invitation",
      payment_source: "payment_source_invitation",
    };

    const titleMap: Record<string, string> = {
      project: "Pozivnica za projekt",
      budget: "Pozivnica za budžet",
      payment_source: "Pozivnica za dijeljeni račun",
    };

    // Resolve worker name (best-effort) for the email greeting
    let workerName: string | undefined;
    if (type === "project" && workerId) {
      const { data: workerRow } = await adminClient
        .from("project_workers")
        .select("first_name, last_name")
        .eq("id", workerId)
        .maybeSingle();
      if (workerRow) {
        workerName = `${(workerRow as any).first_name || ""} ${(workerRow as any).last_name || ""}`.trim() || undefined;
      }
    }

    // In-app notification + push only when user exists
    if (invitedUser) {
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

      await sendPushNotification({
        user_id: invitedUser.id,
        title: titleMap[type],
        body: `${inviterName} vas poziva da se pridružite ${targetLabel} "${targetName}"`,
        data: {
          invitation_id: invitation.id,
          target_id: targetId,
          type: notificationTypeMap[type],
          category: type === 'budget' ? 'budgets' : type === 'payment_source' ? 'transactions' : 'projects',
        },
        source: "send-member-invitation",
      });
    }

    // Send transactional email when sendEmail flag is set (or always for email-only invites)
    let emailSent = false;
    if (sendEmail || !invitedUser) {
      try {
        const inviteUrl = `https://vmbalance.com/join-project/${(invitation as any).token}`;
        const { error: emailError } = await adminClient.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'project-worker-invitation',
            recipientEmail: invitedEmail.toLowerCase(),
            idempotencyKey: `worker-invite-${invitation.id}`,
            templateData: {
              inviterName,
              projectName: targetName,
              workerName,
              inviteUrl,
              isNewUser,
            },
          },
        });
        if (emailError) {
          console.error("[SEND-MEMBER-INVITATION] Email send error:", emailError);
        } else {
          emailSent = true;
          console.log("[SEND-MEMBER-INVITATION] Email sent to", invitedEmail);
        }
      } catch (e) {
        console.error("[SEND-MEMBER-INVITATION] Email exception:", e);
      }
    }

    console.log(`Invitation sent to ${invitedEmail} for ${type} ${targetId} (isNewUser=${isNewUser}, emailSent=${emailSent})`);

    return new Response(
      JSON.stringify({ success: true, invitation, mode: invitedUser ? "in_system" : "email_only", emailSent }),
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
