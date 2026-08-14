// Automatski podsjetnici za dospijeće ULAZNIH računa (incoming_invoices).
//
// Ritam: 3 dana prije dospijeća + na dan dospijeća. Nula korisnikovih dodira
// za postavljanje; gašenje ide globalnim prekidačem
// `notification_preferences.invoice_due_enabled`.
//
// Željezni dedup: `invoice_due:{invoice_id}:{d3|d0}` — po računu i fazi TOČNO
// jednom (provjera se radi bez obzira na status obavijesti, pa ponovni prolaz
// crona ne duplira ni nakon što korisnik obavijest pročita ili odbaci).
//
// POVIJEST NE ZVONI: računi s već prošlim dospijećem ne dobivaju ni push ni
// in-app obavijest. Ta su stanja prikazana kao agregat u "Za pažnju".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { translate } from "../_shared/i18n/index.ts";
import { sendPushNotification } from "../_shared/sendPushNotification.ts";
import { pickDueStage, invoiceDueDedupKey, invoiceDueI18nKeys } from "../_shared/invoiceDue.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fmtAmount = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat("hr-HR", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

const fmtDate = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}.`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const today = body?.today ? new Date(`${String(body.today).slice(0, 10)}T00:00:00Z`) : new Date();
    const dryRun = body?.dry_run === true;

    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const d0 = iso(today);
    const d3 = iso(new Date(today.getTime() + 3 * 86_400_000));

    const { data: invoices, error } = await supabase
      .from("incoming_invoices")
      .select("id, user_id, business_profile_id, supplier_name, counterparty_name, invoice_number, due_date, paid_at, total_amount, currency, direction")
      .eq("direction", "in")
      .is("paid_at", null)
      .in("due_date", [d0, d3]);

    if (error) {
      console.error("[invoice-due-reminders] dohvat računa nije uspio", error);
      return json({ error: "fetch_failed" }, 500);
    }

    const list = invoices ?? [];
    if (list.length === 0) return json({ scanned: 0, created: 0, skipped: 0 });

    // Prekidač po korisniku (default UKLJUČENO kad reda još nema).
    const userIds = [...new Set(list.map((i: any) => i.user_id))];
    const { data: prefRows } = await supabase
      .from("notification_preferences")
      .select("user_id, invoice_due_enabled")
      .in("user_id", userIds);
    const disabled = new Set(
      (prefRows ?? []).filter((p: any) => p.invoice_due_enabled === false).map((p: any) => p.user_id),
    );

    let created = 0;
    let skipped = 0;

    for (const inv of list as any[]) {
      const stage = pickDueStage(inv, today);
      if (!stage) { skipped++; continue; }
      if (disabled.has(inv.user_id)) { skipped++; continue; }

      const dedupKey = invoiceDueDedupKey(inv.id, stage);

      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", inv.user_id)
        .eq("dedup_key", dedupKey)
        .limit(1);
      if (existing && existing.length > 0) { skipped++; continue; }

      const supplier = inv.supplier_name || inv.counterparty_name || inv.invoice_number || "—";
      const amount = fmtAmount(Math.abs(Number(inv.total_amount) || 0), inv.currency || "EUR");
      const date = fmtDate(inv.due_date);
      const vars = { supplier, amount, date };
      const { titleKey, messageKey } = invoiceDueI18nKeys(stage);

      if (dryRun) { created++; continue; }

      const { error: notifErr } = await supabase.from("notifications").insert({
        user_id: inv.user_id,
        type: "invoice_due",
        title: titleKey,
        message: messageKey,
        dedup_key: dedupKey,
        data: {
          invoice_id: inv.id,
          stage,
          due_date: inv.due_date,
          business_profile_id: inv.business_profile_id,
          route: "/dokumenti",
          title_vars: vars,
          message_vars: vars,
        },
      });
      if (notifErr && notifErr.code !== "23505") {
        console.error("[invoice-due-reminders] upis obavijesti nije uspio", notifErr.message);
        continue;
      }
      created++;

      try {
        await sendPushNotification({
          user_id: inv.user_id,
          title: translate("hr", titleKey, vars),
          body: translate("hr", messageKey, vars),
          data: {
            type: "invoice_due",
            category: "reminders",
            route: "/dokumenti",
            invoice_id: inv.id,
            stage,
            i18n_title_key: titleKey,
            i18n_body_key: messageKey,
            i18n_vars: vars,
          },
          source: "invoice-due-reminders",
        });
      } catch (pushErr) {
        console.error("[invoice-due-reminders] push nije poslan", pushErr);
      }
    }

    return json({ scanned: list.length, created, skipped, dry_run: dryRun });
  } catch (e) {
    console.error("[invoice-due-reminders] pao", e);
    return json({ error: String(e) }, 500);
  }
});
