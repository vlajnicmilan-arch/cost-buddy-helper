import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { sendPushNotification } from "../_shared/sendPushNotification.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find due reminders that haven't been notified
    const { data: dueReminders, error: fetchErr } = await supabase
      .from("reminders")
      .select("*")
      .eq("is_completed", false)
      .eq("notified", false)
      .lte("remind_at", new Date().toISOString())
      .limit(50);

    if (fetchErr) {
      console.error("Error fetching reminders:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!dueReminders || dueReminders.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;

    for (const reminder of dueReminders) {
      // Create notification
      const typeEmoji = {
        payment: "💳",
        goal: "🎯",
        review: "📊",
        custom: "⏰",
      }[reminder.type] || "⏰";

      const notifTitle = `${typeEmoji} ${reminder.title}`;
      const notifBody = reminder.description || `Podsjetnik: ${reminder.title}`;

      const { error: notifErr } = await supabase.from("notifications").insert({
        user_id: reminder.user_id,
        title: notifTitle,
        message: notifBody,
        type: "reminder",
        data: {
          reminder_id: reminder.id,
          reminder_type: reminder.type,
          related_entity_id: reminder.related_entity_id,
        },
      });

      if (notifErr) {
        console.error(`Error creating notification for reminder ${reminder.id}:`, notifErr);
        continue;
      }

      // Best-effort push
      await sendPushNotification({
        user_id: reminder.user_id,
        title: notifTitle,
        body: notifBody,
        data: { reminder_id: reminder.id, type: "reminder" },
        source: "check-reminders",
      });

      // Mark as notified
      await supabase
        .from("reminders")
        .update({ notified: true })
        .eq("id", reminder.id);

      processed++;
    }

    console.log(`Processed ${processed} reminders`);

    return new Response(JSON.stringify({ processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Check reminders error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
