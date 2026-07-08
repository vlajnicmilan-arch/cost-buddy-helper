import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPushNotification } from "../_shared/sendPushNotification.ts";
import { translate } from "../_shared/i18n/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type InvitationTypeKey = "project" | "budget" | "payment_source";

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

    const { type, invitationId, action, memberContext, memberBusinessProfileId } = await req.json();

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

    // Determine tables based on type
    let invitationTable: string;
    let idColumn: string;
    let memberTable: string;
    let targetTable: string;
    let targetLabelFallback: string;
    let typeKey: InvitationTypeKey;

    if (type === "project") {
      invitationTable = "project_invitations";
      idColumn = "project_id";
      memberTable = "project_members";
      targetTable = "projects";
      targetLabelFallback = "projekt";
      typeKey = "project";
    } else if (type === "budget") {
      invitationTable = "budget_invitations";
      idColumn = "budget_id";
      memberTable = "budget_members";
      targetTable = "budget_plans";
      targetLabelFallback = "budžet";
      typeKey = "budget";
    } else if (type === "payment_source") {
      invitationTable = "payment_source_invitations";
      idColumn = "payment_source_id";
      memberTable = "payment_source_members";
      targetTable = "custom_payment_sources";
      targetLabelFallback = "račun";
      typeKey = "payment_source";
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

      // For project_members, add display_name + per-member context
      if (type === "project") {
        memberData.display_name = profile?.display_name || null;

        let resolvedContext: 'personal' | 'business' = 'personal';
        let resolvedBusinessProfileId: string | null = null;

        if (memberContext === 'business' && memberBusinessProfileId) {
          // Validate business profile belongs to accepting user
          const { data: bp } = await adminClient
            .from('business_profiles')
            .select('id')
            .eq('id', memberBusinessProfileId)
            .eq('user_id', user.id)
            .maybeSingle();
          if (bp) {
            resolvedContext = 'business';
            resolvedBusinessProfileId = memberBusinessProfileId;
          }
        }

        memberData.member_context = resolvedContext;
        memberData.member_business_profile_id = resolvedBusinessProfileId;
      }

      const { error: memberError } = await adminClient
        .from(memberTable)
        .insert(memberData);

      if (memberError) {
        console.error("Error adding member:", memberError);
        throw memberError;
      }

      // For projects: initialize per-tab permissions from invitation.default_permissions
      if (type === "project") {
        const optionalTabs = ['overview', 'milestones', 'workers', 'collaborators', 'funding', 'transactions'];
        const defaults = ((invitation as any).default_permissions ?? {}) as Record<string, boolean>;
        const hasDefaults = defaults && Object.keys(defaults).length > 0;

        const permRows = optionalTabs.map((tab_key) => ({
          project_id: targetId,
          user_id: user.id,
          tab_key,
          visible: hasDefaults ? defaults[tab_key] === true : false,
        }));

        const { error: permError } = await adminClient
          .from("project_member_permissions")
          .upsert(permRows, { onConflict: "project_id,user_id,tab_key" });

        if (permError) {
          console.log("Error initializing permissions:", permError.message);
        }
      }

      // Update invitation status
      await adminClient
        .from(invitationTable)
        .update({ status: "accepted" })
        .eq("id", invitationId);

      // Notify the inviter
      const { data: targetData } = await adminClient
        .from(targetTable)
        .select("name")
        .eq("id", targetId)
        .single();

      const targetName = targetData?.name || targetLabelFallback;
      const userName = profile?.display_name || "Korisnik";

      const titleKey = "notifications.invitation_accepted.title";
      const messageKey = `notifications.invitation_accepted.message.${typeKey}`;
      const pushMessageKey = `notifications.invitation_accepted.push.${typeKey}`;
      const vars = { userName, targetName };

      await adminClient
        .from("notifications")
        .insert({
          user_id: invitation.invited_by,
          type: "invitation_accepted",
          title: titleKey,
          message: messageKey,
          data: {
            target_id: targetId,
            target_name: targetName,
            type: type,
            user_id: user.id,
            user_name: userName,
            title_vars: {},
            message_vars: vars,
          },
        });

      // Best-effort push to the inviter — send-push translates per language.
      await sendPushNotification({
        user_id: invitation.invited_by,
        title: translate("hr", titleKey),
        body: translate("hr", pushMessageKey, vars),
        data: {
          target_id: targetId,
          type: "invitation_accepted",
          category: "projects",
          i18n_title_key: titleKey,
          i18n_body_key: pushMessageKey,
          title_vars: {},
          message_vars: vars,
        },
        source: "respond-to-invitation",
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
