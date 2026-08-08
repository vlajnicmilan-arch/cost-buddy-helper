// MAIL UVOZ — prijemna točka (korak 1).
// STORE-THEN-PROCESS: poruka + privitci + posao u redu obrade upisuju se u
// ISTOJ transakciji (RPC), tek onda 200. Nikakva obrada se ovdje ne radi.
//
// Secreti:
//   MAIL_INGEST_PATH_SECRET        — tajni segment putanje
//   MAILGUN_WEBHOOK_SIGNING_KEY    — HMAC potpis (dok nije postavljen: sve 401)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const TIMESTAMP_TOLERANCE_S = 300;
// Brane po aliasu — iznad ovoga poruka se sprema sirova, bez posla u redu.
const MAX_PER_HOUR = 30;
const MAX_PER_DAY = 100;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Iz "Ime <c-abc@centar.vmbalance.com>, drugi@x" izvlači sve lokalne dijelove. */
export function extractRecipientLocals(recipients: string): string[] {
  const out: string[] = [];
  for (const raw of recipients.split(",")) {
    const m = raw.match(/([^\s<>,;]+)@([^\s<>,;]+)/);
    if (m) out.push(m[1].toLowerCase());
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const pathSecret = Deno.env.get("MAIL_INGEST_PATH_SECRET");
    const signingKey = Deno.env.get("MAILGUN_WEBHOOK_SIGNING_KEY");

    // Tajni segment putanje
    const segments = new URL(req.url).pathname.split("/").filter(Boolean);
    const provided = segments[segments.length - 1] ?? "";
    if (!pathSecret || provided === "mail-ingest" || !timingSafeEqual(provided, pathSecret)) {
      return json({ error: "unauthorized" }, 401);
    }

    // Bez ključa za potpis funkcija je gluha — to je ISPRAVNO ponašanje.
    if (!signingKey) {
      console.warn("[mail-ingest] MAILGUN_WEBHOOK_SIGNING_KEY nije postavljen — odbijam 401");
      return json({ error: "unauthorized" }, 401);
    }

    const contentType = req.headers.get("content-type") ?? "";
    if (
      !contentType.includes("multipart/form-data") &&
      !contentType.includes("application/x-www-form-urlencoded")
    ) {
      return json({ error: "unsupported_content_type" }, 400);
    }

    const declaredSize = Number(req.headers.get("content-length") ?? "0");
    if (declaredSize > MAX_TOTAL_BYTES) return json({ error: "payload_too_large" }, 413);

    const form = await req.formData();
    const field = (name: string): string => {
      const v = form.get(name);
      return typeof v === "string" ? v : "";
    };

    // HMAC potpis
    const timestamp = field("timestamp");
    const token = field("token");
    const signature = field("signature");
    if (!timestamp || !token || !signature) return json({ error: "unauthorized" }, 401);

    const expected = await hmacHex(signingKey, `${timestamp}${token}`);
    if (!timingSafeEqual(expected, signature)) {
      console.warn("[mail-ingest] neispravan potpis");
      return json({ error: "unauthorized" }, 401);
    }

    const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(skew) || skew > TIMESTAMP_TOLERANCE_S) {
      return json({ error: "stale_timestamp" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Replay → no-op 200
    const { data: existing } = await supabase
      .from("inbound_messages")
      .select("id")
      .eq("provider", "mailgun")
      .eq("provider_event_id", token)
      .maybeSingle();
    if (existing) return json({ ok: true, replay: true });

    // Alias lookup — bez valjanog AKTIVNOG aliasa NE nastaje NIŠTA.
    const locals = extractRecipientLocals(
      [field("recipient"), field("To"), field("to")].filter(Boolean).join(","),
    );
    if (locals.length === 0) return json({ ok: true, ignored: "no_recipient" });

    const { data: aliasRow } = await supabase
      .from("mail_aliases")
      .select("id, user_id")
      .in("alias_local", locals)
      .is("disabled_at", null)
      .maybeSingle();

    if (!aliasRow) {
      console.warn("[mail-ingest] nepoznat ili ugašen alias — odbacujem bez zapisa");
      return json({ ok: true, ignored: "unknown_alias" });
    }

    // Sirovo tijelo + privitci u privatnu pohranu (prije transakcijskog upisa).
    const messageUuid = crypto.randomUUID();
    const basePath = `${aliasRow.user_id}/${messageUuid}`;
    const rawBody = JSON.stringify(
      Object.fromEntries(
        Array.from(form.entries()).filter(([, v]) => typeof v === "string"),
      ),
    );
    const bodyPath = `${basePath}/raw.json`;
    const bodyBytes = new TextEncoder().encode(rawBody);

    const { error: bodyErr } = await supabase.storage
      .from("inbound-mail")
      .upload(bodyPath, bodyBytes, { contentType: "application/json", upsert: true });
    if (bodyErr) {
      console.error("[mail-ingest] upload tijela nije uspio", bodyErr);
      return json({ error: "storage_failed" }, 500);
    }

    let totalBytes = bodyBytes.byteLength;
    const attachments: Array<Record<string, string>> = [];
    let index = 0;
    for (const [, value] of form.entries()) {
      if (!(value instanceof File)) continue;
      index += 1;
      totalBytes += value.size;
      if (totalBytes > MAX_TOTAL_BYTES) return json({ error: "payload_too_large" }, 413);
      const attPath = `${basePath}/att-${index}-${value.name || "privitak"}`;
      // Transportni otisak — isti privitak istog vlasnika nikad se ne obrađuje dvaput.
      const attBytes = new Uint8Array(await value.arrayBuffer());
      const digest = await crypto.subtle.digest("SHA-256", attBytes);
      const sha256 = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const { error: attErr } = await supabase.storage
        .from("inbound-mail")
        .upload(attPath, attBytes, {
          contentType: value.type || "application/octet-stream",
          upsert: true,
        });
      if (attErr) {
        console.error("[mail-ingest] upload privitka nije uspio", attErr);
        return json({ error: "storage_failed" }, 500);
      }
      attachments.push({
        storage_path: attPath,
        mime_declared: value.type || "application/octet-stream",
        size_bytes: String(value.size),
        content_sha256: sha256,
      });
    }

    // Brana: preko granice poruka se SPREMA, ali posao NE ulazi u red.
    const { data: counts } = await supabase.rpc("mail_ingest_rate_counts", {
      p_alias_id: aliasRow.id,
    });
    const lastHour = Number((counts as Record<string, unknown> | null)?.last_hour ?? 0);
    const lastDay = Number((counts as Record<string, unknown> | null)?.last_day ?? 0);
    const damReason = lastHour >= MAX_PER_HOUR
      ? "brana_sat"
      : lastDay >= MAX_PER_DAY
        ? "brana_dan"
        : null;
    if (damReason) {
      console.warn(`[mail-ingest] brana aktivna (${damReason}) za alias ${aliasRow.id}`);
    }

    // Transakcijski outbox: poruka + privitci + posao ili NIŠTA.
    const { data: stored, error: rpcErr } = await supabase.rpc("mail_ingest_store_message", {
      p_owner_user_id: aliasRow.user_id,
      p_alias_id: aliasRow.id,
      p_provider: "mailgun",
      p_provider_event_id: token,
      p_from_header: field("from") || field("From") || null,
      p_subject: field("subject") || field("Subject") || null,
      p_received_at: new Date(Number(timestamp) * 1000).toISOString(),
      p_spf_result: field("X-Mailgun-Spf") || null,
      p_dkim_result: field("X-Mailgun-Dkim-Check-Result") || null,
      p_arc_result: field("X-Mailgun-Arc") || null,
      p_dmarc_result: field("X-Mailgun-Dmarc") || null,
      p_body_storage_path: bodyPath,
      p_size_bytes: totalBytes,
      p_attachments: attachments,
      p_dam_reason: damReason,
    });

    if (rpcErr) {
      console.error("[mail-ingest] transakcijski upis nije uspio", rpcErr);
      return json({ error: "store_failed" }, 500);
    }

    return json({ ok: true, ...(stored as Record<string, unknown>) });
  } catch (e) {
    console.error("[mail-ingest] unhandled", e);
    return json({ error: (e as Error)?.message ?? "unknown" }, 500);
  }
});
