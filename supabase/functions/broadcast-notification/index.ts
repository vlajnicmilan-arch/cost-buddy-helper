import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPushNotification, sendPushNotificationToMany } from "../_shared/sendPushNotification.ts";

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

    const { title, message, targetUserId } = await req.json();
    if (!title || !message) {
      return new Response(JSON.stringify({ error: "Title and message are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If targetUserId is provided, send to a single user
    if (targetUserId) {
      const { error: insertError } = await supabase
        .from("notifications")
        .insert({
          user_id: targetUserId,
          title,
          message,
          type: "system",
          read: false,
        });

      if (insertError) throw insertError;

      await sendPushNotification({
        user_id: targetUserId,
        title,
        body: message,
        data: { type: "system", category: "broadcast" },
        source: "broadcast-notification",
      });

      return new Response(
        JSON.stringify({ success: true, count: 1 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Paginate through ALL users (auth.admin.listUsers caps perPage at 1000 but
    // also stops there — silent truncation on bigger bases). Loop until empty page.
    const allUserIds: string[] = [];
    const PER_PAGE = 1000;
    for (let page = 1; page < 1000; page++) {
      const { data, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
      if (listError) throw listError;
      const batch = data?.users ?? [];
      if (batch.length === 0) break;
      for (const u of batch) allUserIds.push(u.id);
      if (batch.length < PER_PAGE) break;
    }
    console.log(`[BROADCAST] Targeting ${allUserIds.length} users`);

    // Insert notifications in chunks (avoid single 10k+ row insert)
    const NOTIF_CHUNK = 500;
    for (let i = 0; i < allUserIds.length; i += NOTIF_CHUNK) {
      const slice = allUserIds.slice(i, i + NOTIF_CHUNK);
      const notifications = slice.map((id) => ({
        user_id: id,
        title,
        message,
        type: "system",
        read: false,
      }));
      const { error: insertError } = await supabase.from("notifications").insert(notifications);
      if (insertError) throw insertError;
    }

    // Push fan-out: sequential chunks of 50 (each call invokes send-push edge fn;
    // running 1000+ in parallel hits rate limits and stalls). Best-effort.
    const PUSH_CHUNK = 50;
    for (let i = 0; i < allUserIds.length; i += PUSH_CHUNK) {
      const slice = allUserIds.slice(i, i + PUSH_CHUNK);
      try {
        await sendPushNotificationToMany(slice, {
          title,
          body: message,
          data: { type: "system", category: "broadcast" },
          source: "broadcast-notification",
        });
      } catch (e) {
        console.error("[BROADCAST] push chunk failed", { i, err: e });
      }
    }

    return new Response(
      JSON.stringify({ success: true, count: allUserIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
