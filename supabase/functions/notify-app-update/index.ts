// Sends in-app + native push update notifications after a release APK is published.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { sendPushNotification } from "../_shared/sendPushNotification.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-upload-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Lang = "hr" | "en" | "de";

const copy: Record<Lang, { title: string; body: (v: string) => string }> = {
  hr: {
    title: "Dostupno je ažuriranje aplikacije",
    body: (v) => `Verzija ${v} je spremna. Dodirni za preuzimanje i instalaciju.`,
  },
  en: {
    title: "App update available",
    body: (v) => `Version ${v} is ready. Tap to download and install it.`,
  },
  de: {
    title: "App-Update verfügbar",
    body: (v) => `Version ${v} ist bereit. Tippen Sie zum Herunterladen und Installieren.`,
  },
};

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

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, preferred_language")
      .in("user_id", userIds);
    const langByUser = new Map<string, Lang>();
    (profiles ?? []).forEach((p: any) => {
      langByUser.set(p.user_id, (["hr", "en", "de"].includes(p.preferred_language) ? p.preferred_language : "hr") as Lang);
    });

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

    const notifications = pendingUserIds.map((userId) => {
      const lang = langByUser.get(userId) ?? "hr";
      return {
        user_id: userId,
        type: "app_update",
        title: copy[lang].title,
        message: copy[lang].body(body.version!),
        data: {
          type: "app_update",
          category: "app_update",
          version: body.version,
          minSupportedVersion: body.minSupportedVersion ?? "0.0.0",
          sha256: body.sha256 ?? null,
          apkUrl: body.apkUrl ?? null,
          deeplink: "/install",
        },
        read: false,
      };
    });

    const { error: insertError } = await supabase.from("notifications").insert(notifications);
    if (insertError) throw insertError;

    let pushed = 0;
    await Promise.all(pendingUserIds.map(async (userId) => {
      const lang = langByUser.get(userId) ?? "hr";
      await sendPushNotification({
        user_id: userId,
        title: copy[lang].title,
        body: copy[lang].body(body.version!),
        data: {
          type: "broadcast",
          category: "app_update",
          version: body.version,
          apkUrl: body.apkUrl ?? "",
          url: "/install",
          deeplink: "/install",
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