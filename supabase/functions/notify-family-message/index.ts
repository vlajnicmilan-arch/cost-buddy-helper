import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPushNotificationToMany } from "../_shared/sendPushNotification.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { message_id, group_id, sender_id, content } = await req.json();

    if (!message_id || !group_id || !sender_id) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get sender display name
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", sender_id)
      .single();

    const senderName = senderProfile?.display_name || "Član";

    // Get group name
    const { data: group } = await supabase
      .from("family_groups")
      .select("name")
      .eq("id", group_id)
      .single();

    const groupName = group?.name || "Grupa";

    // Get all members except sender
    const { data: members } = await supabase
      .from("family_members")
      .select("user_id")
      .eq("group_id", group_id)
      .neq("user_id", sender_id);

    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ ok: true, notified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Truncate message for notification
    const truncated = content?.length > 80 ? content.substring(0, 80) + "…" : (content || "");

    const notifications = members.map((m) => ({
      user_id: m.user_id,
      type: "family_message",
      title: `💬 ${senderName} u ${groupName}`,
      message: truncated,
      data: { group_id, message_id },
    }));

    const { error } = await supabase.from("notifications").insert(notifications);

    if (error) {
      console.error("Error inserting notifications:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Best-effort push fan-out
    await sendPushNotificationToMany(
      members.map((m) => m.user_id),
      {
        title: `💬 ${senderName} u ${groupName}`,
        body: truncated,
        data: { group_id, message_id, type: "family_message", category: "chat" },
        source: "notify-family-message",
      }
    );

    return new Response(JSON.stringify({ ok: true, notified: members.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
