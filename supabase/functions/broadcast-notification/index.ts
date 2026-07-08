// WS3a-2 Batch B — per-language broadcast payload.
// Admin sends { title_hr, title_en, title_de, message_hr, message_en, message_de }
// (optional targetUserId). Each recipient's row/push is picked by their
// profiles.preferred_language with HR fallback.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPushNotification, sendPushNotificationToMany } from "../_shared/sendPushNotification.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Lang = "hr" | "en" | "de";
const SUPPORTED: readonly Lang[] = ["hr", "en", "de"] as const;

interface LangMap {
  hr: string;
  en: string;
  de: string;
}

function normLang(v: string | null | undefined): Lang {
  if (!v) return "hr";
  const lower = v.toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED as readonly string[]).includes(lower) ? (lower as Lang) : "hr";
}

function pickForLang(map: LangMap, lang: Lang): string {
  const v = map[lang];
  if (v && v.trim().length > 0) return v;
  return map.hr; // HR fallback for empty fields
}

function parsePayload(body: any): { titles: LangMap; messages: LangMap } | { error: string } {
  // Preferred: explicit per-language fields.
  const hasPerLang = ["title_hr", "title_en", "title_de", "message_hr", "message_en", "message_de"]
    .some((k) => typeof body?.[k] === "string");

  if (hasPerLang) {
    const titles: LangMap = {
      hr: String(body.title_hr ?? "").trim(),
      en: String(body.title_en ?? "").trim(),
      de: String(body.title_de ?? "").trim(),
    };
    const messages: LangMap = {
      hr: String(body.message_hr ?? "").trim(),
      en: String(body.message_en ?? "").trim(),
      de: String(body.message_de ?? "").trim(),
    };
    if (!titles.hr || !messages.hr) {
      return { error: "hr_required" };
    }
    return { titles, messages };
  }

  // Legacy fallback: { title, message } — treated as HR (and used for all languages).
  if (typeof body?.title === "string" && typeof body?.message === "string") {
    const t = body.title.trim();
    const m = body.message.trim();
    if (!t || !m) return { error: "title_and_message_required" };
    return {
      titles: { hr: t, en: t, de: t },
      messages: { hr: m, en: m, de: m },
    };
  }

  return { error: "title_and_message_required" };
}

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

    const body = await req.json();
    const parsed = parsePayload(body);
    if ("error" in parsed) {
      return new Response(JSON.stringify({ error: parsed.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { titles, messages } = parsed;
    const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId : null;

    // Single-user target
    if (targetUserId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("preferred_language")
        .eq("user_id", targetUserId)
        .maybeSingle();
      const lang = normLang((prof as any)?.preferred_language ?? null);
      const title = pickForLang(titles, lang);
      const message = pickForLang(messages, lang);

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

    // Fan-out: enumerate all users, group by preferred language, send tailored payload.
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

    // Group users by preferred language (default hr when profile missing).
    const langByUser = new Map<string, Lang>();
    const PROF_CHUNK = 1000;
    for (let i = 0; i < allUserIds.length; i += PROF_CHUNK) {
      const slice = allUserIds.slice(i, i + PROF_CHUNK);
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, preferred_language")
        .in("user_id", slice);
      (profs ?? []).forEach((p: any) => {
        langByUser.set(p.user_id, normLang(p.preferred_language));
      });
    }
    for (const uid of allUserIds) {
      if (!langByUser.has(uid)) langByUser.set(uid, "hr");
    }

    // Insert notifications in chunks (per row rendering).
    const NOTIF_CHUNK = 500;
    for (let i = 0; i < allUserIds.length; i += NOTIF_CHUNK) {
      const slice = allUserIds.slice(i, i + NOTIF_CHUNK);
      const notifications = slice.map((id) => {
        const lang = langByUser.get(id) ?? "hr";
        return {
          user_id: id,
          title: pickForLang(titles, lang),
          message: pickForLang(messages, lang),
          type: "system",
          read: false,
        };
      });
      const { error: insertError } = await supabase.from("notifications").insert(notifications);
      if (insertError) throw insertError;
    }

    // Push fan-out grouped by language: 3 groups × chunks of 50 each.
    const groups: Record<Lang, string[]> = { hr: [], en: [], de: [] };
    for (const [uid, lang] of langByUser.entries()) groups[lang].push(uid);

    const PUSH_CHUNK = 50;
    for (const lang of SUPPORTED) {
      const ids = groups[lang];
      const title = pickForLang(titles, lang);
      const bodyText = pickForLang(messages, lang);
      for (let i = 0; i < ids.length; i += PUSH_CHUNK) {
        const slice = ids.slice(i, i + PUSH_CHUNK);
        try {
          await sendPushNotificationToMany(slice, {
            title,
            body: bodyText,
            data: { type: "system", category: "broadcast" },
            source: "broadcast-notification",
          });
        } catch (e) {
          console.error("[BROADCAST] push chunk failed", { lang, i, err: e });
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, count: allUserIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
