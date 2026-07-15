// Modul "Odluke" — Faza 4: podsjetnici (nikad ne mijenja status odluke).
// Cron: svakih 30 min (vidi migracija/insert).
//
// Pragovi (v. src/lib/decisionReminderRules.ts):
//  - 12h → jednokratni podsjetnik strani na redu
//  - 24h → oznaka overdue + push objema stranama
//  - dnevni podsjetnik strani na redu dok je overdue

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { sendPushNotification } from "../_shared/sendPushNotification.ts";
import { translate, resolveLang } from "../_shared/i18n/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRST_REMINDER_MS = 12 * 60 * 60 * 1000;
const OVERDUE_MS = 24 * 60 * 60 * 1000;
const DAILY_REMINDER_MS = 24 * 60 * 60 * 1000;

type Action = "first_reminder" | "mark_overdue" | "daily_reminder";

function decideActions(opts: {
  now: Date;
  lastActivityAt: Date;
  overdue: boolean;
  lastReminderSentAt: Date | null;
}): Action[] {
  const { now, lastActivityAt, overdue, lastReminderSentAt } = opts;
  const sinceActivity = now.getTime() - lastActivityAt.getTime();
  const out: Action[] = [];
  if (!overdue && sinceActivity >= OVERDUE_MS) {
    out.push("mark_overdue", "daily_reminder");
    return out;
  }
  if (!overdue && sinceActivity >= FIRST_REMINDER_MS && lastReminderSentAt === null) {
    out.push("first_reminder");
    return out;
  }
  if (overdue) {
    const sinceReminder = lastReminderSentAt
      ? now.getTime() - lastReminderSentAt.getTime()
      : Number.POSITIVE_INFINITY;
    if (sinceReminder >= DAILY_REMINDER_MS) out.push("daily_reminder");
  }
  return out;
}

async function isEnabled(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data } = await supabase.rpc("is_push_category_enabled", {
      _user_id: userId,
      _category: "decisions",
    });
    return data !== false;
  } catch {
    return true;
  }
}

async function resolveUserLang(supabase: any, userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("preferred_language")
      .eq("user_id", userId)
      .maybeSingle();
    return resolveLang((data as any)?.preferred_language ?? null);
  } catch {
    return "hr";
  }
}

async function pushAndNotify(supabase: any, opts: {
  userId: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}) {
  const { userId, title, body, data } = opts;
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      type: "decision_reminder",
      title,
      message: body,
      data,
      entity_type: "project_decision",
      entity_id: data.decision_id ?? null,
      severity: "info",
    });
  } catch (e) {
    console.error("[decisions-reminder-tick] insert notification failed", e);
  }
  try {
    await sendPushNotification({
      user_id: userId,
      title,
      body,
      data,
      source: "decisions-reminder-tick",
    });
  } catch (e) {
    console.error("[decisions-reminder-tick] push failed", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const now = new Date();
    const cutoff = new Date(now.getTime() - FIRST_REMINDER_MS).toISOString();

    // Kandidati: awaiting_response i updated_at (= vrijeme zadnjeg koraka)
    // stariji od 12h; sve mlađe ne može okinuti nikakav prag.
    const { data: decisions, error } = await supabase
      .from("project_decisions")
      .select("id, project_id, title, updated_at, overdue, last_reminder_sent_at")
      .eq("current_status", "awaiting_response")
      .lte("updated_at", cutoff)
      .limit(200);

    if (error) {
      console.error("[decisions-reminder-tick] fetch error", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    for (const d of decisions ?? []) {
      const actions = decideActions({
        now,
        lastActivityAt: new Date(d.updated_at as string),
        overdue: !!d.overdue,
        lastReminderSentAt: d.last_reminder_sent_at
          ? new Date(d.last_reminder_sent_at as string)
          : null,
      });
      if (actions.length === 0) continue;

      // Nadji projekt + vlasnika + investitora + zadnji korak (tko je zadnji odgovorio)
      const [{ data: project }, { data: investorRow }, { data: lastStep }] = await Promise.all([
        supabase.from("projects").select("id, name, user_id").eq("id", d.project_id).maybeSingle(),
        supabase.from("project_members").select("user_id").eq("project_id", d.project_id).eq("role", "investor").maybeSingle(),
        supabase.from("project_decision_steps")
          .select("actor_user_id, step_no")
          .eq("decision_id", d.id)
          .order("step_no", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!project) continue;
      const ownerId = (project as any).user_id as string;
      const investorId = (investorRow as any)?.user_id as string | undefined;
      const lastActor = (lastStep as any)?.actor_user_id as string | undefined;
      if (!lastActor) continue;

      // "Strana na redu" = suprotna od zadnjeg aktora
      const waitingUserId = lastActor === ownerId ? (investorId ?? null) : ownerId;
      if (!waitingUserId) continue;

      const decisionTitle = String((d as any).title ?? "");
      const dataPayload = {
        decision_id: d.id,
        project_id: d.project_id,
        project_name: (project as any).name,
        decision_title: decisionTitle,
      };

      for (const action of actions) {
        if (action === "mark_overdue") {
          // Označi overdue
          await supabase
            .from("project_decisions")
            .update({ overdue: true })
            .eq("id", d.id);

          // Push objema stranama (poštuj notif prefs)
          const parties = [ownerId, investorId].filter(Boolean) as string[];
          for (const uid of parties) {
            if (!(await isEnabled(supabase, uid))) continue;
            const lang = await resolveUserLang(supabase, uid);
            const title = translate(lang, "notifications.decisions.overdue.title");
            const body = translate(lang, "notifications.decisions.overdue.body", { title: decisionTitle });
            await pushAndNotify(supabase, { userId: uid, title, body, data: dataPayload });
          }
          continue;
        }

        // first_reminder ili daily_reminder → strana na redu
        if (!(await isEnabled(supabase, waitingUserId))) continue;
        const lang = await resolveUserLang(supabase, waitingUserId);
        const key = action === "first_reminder"
          ? "notifications.decisions.first_reminder"
          : "notifications.decisions.daily";
        const title = translate(lang, `${key}.title`);
        const body = translate(lang, `${key}.body`, { title: decisionTitle });
        await pushAndNotify(supabase, {
          userId: waitingUserId,
          title,
          body,
          data: dataPayload,
        });

        await supabase
          .from("project_decisions")
          .update({ last_reminder_sent_at: now.toISOString() })
          .eq("id", d.id);
      }

      processed++;
    }

    return new Response(
      JSON.stringify({ scanned: decisions?.length ?? 0, processed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[decisions-reminder-tick] fatal", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
