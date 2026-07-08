// Sends in-app + native push update notifications after a release APK is published.
// WS3a-2 Batch B — uses centralized i18n catalog; send-push translates per recipient.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { sendPushNotification } from "../_shared/sendPushNotification.ts";
import { translate } from "../_shared/i18n/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-upload-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TITLE_KEY = "notifications.app_update.title";
const MESSAGE_KEY = "notifications.app_update.message";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const expectedToken = Deno.env.get("APK_UPLOAD_TOKEN");
    if (!expectedToken) return json({ error: "APK_UPLOAD_TOKEN not configured" }, 500);
    if (req.headers.get("x-upload-token") !== expectedToken) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => null) as
      | { version?: string; minSupportedVersion?: string | null; sha256?: string | null; apkUrl?: string | null }
      | null;

    if (!body?.version || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(body.version)) {
      return json({ error: "Invalid or missing version" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tokenRows, error: tokenError } = await supabase
      .from("push_tokens")
      .select("user_id");
    if (tokenError) throw tokenError;

    const userIds = [...new Set((tokenRows ?? []).map((row: any) => row.user_id).filter(Boolean))];
    if (userIds.length === 0) {
      return json({ success: true, targetedUsers: 0, inserted: 0, pushed: 0 });
    }

    const { data: existing } = await supabase
      .from("notifications")
      .select("user_id")
      .eq("type", "app_update")
      .eq("data->>version", body.version);
    const alreadyNotified = new Set((existing ?? []).map((row: any) => row.user_id));
    const pendingUserIds = userIds.filter((userId) => !alreadyNotified.has(userId));

    if (pendingUserIds.length === 0) {
      return json({ success: true, targetedUsers: userIds.length, inserted: 0, pushed: 0, skippedExisting: userIds.length });
    }

    const titleVars = {};
    const messageVars = { version: body.version };

    const notifications = pendingUserIds.map((userId) => ({
      user_id: userId,
      type: "app_update",
      title: TITLE_KEY,
      message: MESSAGE_KEY,
      data: {
        type: "app_update",
        category: "app_update",
        version: body.version,
        minSupportedVersion: body.minSupportedVersion ?? "0.0.0",
        sha256: body.sha256 ?? null,
        apkUrl: body.apkUrl ?? null,
        deeplink: "/install",
        title_vars: titleVars,
        message_vars: messageVars,
      },
      read: false,
    }));

    const { error: insertError } = await supabase.from("notifications").insert(notifications);
    if (insertError) throw insertError;

    let pushed = 0;
    // HR fallback pre-rendered (send-push overrides via i18n keys if present).
    const fallbackTitle = translate("hr", TITLE_KEY, titleVars);
    const fallbackBody = translate("hr", MESSAGE_KEY, messageVars);

    await Promise.all(pendingUserIds.map(async (userId) => {
      await sendPushNotification({
        user_id: userId,
        title: fallbackTitle,
        body: fallbackBody,
        data: {
          type: "broadcast",
          category: "app_update",
          version: body.version,
          apkUrl: body.apkUrl ?? "",
          url: "/install",
          deeplink: "/install",
          i18n_title_key: TITLE_KEY,
          i18n_body_key: MESSAGE_KEY,
          title_vars: titleVars,
          message_vars: messageVars,
        },
        source: "notify-app-update",
      });
      pushed += 1;
    }));

    return json({ success: true, targetedUsers: userIds.length, inserted: notifications.length, pushed, skippedExisting: alreadyNotified.size });
  } catch (error) {
    console.error("[notify-app-update]", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
