// MAIL UVOZ — WORKER (korak 2). Nikad se ne poziva iz webhooka.
//
// Petlja: ATOMSKO preuzimanje posla (FOR UPDATE SKIP LOCKED u RPC-u) →
// sigurnosni cjevovod privitka → hijerarhija klasifikacije → stavka na pregled.
// Neuspjeh: retry ×3 s backoffom, pa 'neuspjela_konacno' s vidljivom akcijom.
//
// KVOTA (svjesna odluka): mjesečna kvota mail uvoza troši se za VLASNIKA
// ALIASA preko `mail_import_consume_quota(p_user_id)`. Dnevna po-rutna kvota iz
// aiQuota.ts čita auth.uid(), što service klijent nema — zato je mjerodavna
// mjesečna kvota + globalni cost cap (`checkAiCostCap` / `recordAiCost`).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { evaluateMime } from "../_shared/mailImport/mimeSniff.ts";
import { evaluatePdfPages } from "../_shared/mailImport/pdfPages.ts";
import { inspectXml } from "../_shared/mailImport/xmlSafety.ts";
import { htmlToText, extractLinks } from "../_shared/mailImport/htmlToText.ts";
import { evaluateTrust, isAuthenticatedGoogle } from "../_shared/mailImport/trustLevel.ts";
import { checkIbanAgainstHistory } from "../_shared/mailImport/ibanCheck.ts";
import { classifyDocument, lowerConfidence, type ClassifyInput } from "../_shared/mailImport/classify.ts";
import { parseUbl } from "../_shared/mailImport/parseUblBridge.ts";
import { upsertIngestItem } from "../_shared/mailImport/ingestItemUpsert.ts";
import { checkAiCostCap, recordAiCost } from "../_shared/aiCostCap.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_ROUTE = "mail-import";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Supa = ReturnType<typeof createClient>;

async function aiAnalyze(input: ClassifyInput): Promise<{
  classification: "racun" | "ponuda" | "nije_za_nas" | "nepoznato";
  extraction: Record<string, unknown> | null;
  confidence: "visoka" | "srednja" | "niska";
}> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("missing_lovable_api_key");

  const prompt = [
    "Klasificiraj dokument iz e-pošte. Vrati ISKLJUČIVO JSON:",
    '{"classification":"racun|ponuda|nije_za_nas","confidence":"visoka|srednja|niska",',
    '"supplier_oib":"","supplier_name":"","invoice_number":"","issue_date":"YYYY-MM-DD",',
    '"due_date":"YYYY-MM-DD","total_amount":0,"vat_amount":0,"currency":"EUR","iban":""}',
    "",
    `Predmet: ${input.subject ?? ""}`,
    `Pošiljatelj: ${input.fromHeader ?? ""}`,
    "Tekst:",
    (input.bodyText ?? "").slice(0, 12000),
  ].join("\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`ai_gateway_${res.status}`);
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "{}";
  const cleaned = String(raw).replace(/```json|```/g, "").trim();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { classification: "nepoznato", extraction: null, confidence: "niska" };
  }
  const cls = String(parsed.classification ?? "nije_za_nas");
  return {
    classification: (["racun", "ponuda", "nije_za_nas"].includes(cls) ? cls : "nije_za_nas") as
      "racun" | "ponuda" | "nije_za_nas",
    extraction: parsed,
    confidence: (["visoka", "srednja", "niska"].includes(String(parsed.confidence))
      ? String(parsed.confidence)
      : "srednja") as "visoka" | "srednja" | "niska",
  };
}

async function knownCounterparties(supabase: Supa, userId: string) {
  const [{ data: ibanRows }, { data: invRows }] = await Promise.all([
    supabase.from("eracun_counterparty_iban").select("oib, iban").eq("user_id", userId),
    supabase.from("incoming_invoices").select("supplier_oib, iban").eq("user_id", userId).limit(500),
  ]);
  const byOib = new Map<string, string[]>();
  for (const r of (ibanRows ?? []) as Array<Record<string, string>>) {
    if (!r.oib) continue;
    byOib.set(r.oib, [...(byOib.get(r.oib) ?? []), r.iban]);
  }
  for (const r of (invRows ?? []) as Array<Record<string, string>>) {
    if (!r.supplier_oib || !r.iban) continue;
    byOib.set(r.supplier_oib, [...(byOib.get(r.supplier_oib) ?? []), r.iban]);
  }
  return { byOib, oibs: Array.from(byOib.keys()) };
}

async function processMessage(supabase: Supa, messageId: string): Promise<void> {
  const { data: msg, error: msgErr } = await supabase
    .from("inbound_messages")
    .select("*")
    .eq("id", messageId)
    .single();
  if (msgErr || !msg) throw new Error("poruka_ne_postoji");

  const ownerId = msg.owner_user_id as string;

  const trust = evaluateTrust({
    spf: msg.spf_result,
    dkim: msg.dkim_result,
    arc: msg.arc_result,
    dmarc: msg.dmarc_result,
    fromHeader: msg.from_header,
    originalAuthResults: null,
  });
  await supabase.from("inbound_messages").update({ trust_level: trust.level }).eq("id", messageId);

  // Sirovo tijelo — HTML u tekst BEZ ijednog mrežnog dohvata.
  let bodyText = "";
  let links: string[] = [];
  if (msg.body_storage_path) {
    const { data: blob } = await supabase.storage
      .from("inbound-mail")
      .download(msg.body_storage_path as string);
    if (blob) {
      const raw = JSON.parse(await blob.text()) as Record<string, string>;
      const html = raw["body-html"] ?? raw["stripped-html"] ?? "";
      const plain = raw["body-plain"] ?? raw["stripped-text"] ?? "";
      bodyText = plain || htmlToText(html);
      links = extractLinks(html || plain);
    }
  }

  const { byOib, oibs } = await knownCounterparties(supabase, ownerId);

  const { data: atts } = await supabase
    .from("inbound_attachments")
    .select("*")
    .eq("message_id", messageId);

  const units: Array<{ attachmentId: string | null; bytes: Uint8Array | null; att: Record<string, unknown> | null }> =
    [];
  for (const att of (atts ?? []) as Array<Record<string, unknown>>) {
    const { data: blob } = await supabase.storage
      .from("inbound-mail")
      .download(att.storage_path as string);
    units.push({
      attachmentId: att.id as string,
      bytes: blob ? new Uint8Array(await blob.arrayBuffer()) : null,
      att,
    });
  }
  if (units.length === 0) units.push({ attachmentId: null, bytes: null, att: null });

  for (const unit of units) {
    let sniffed: ClassifyInput["sniffed"] = "unknown";
    let xml: string | null = null;
    let forcedConfidence: "niska" | null = trust.forcedConfidence;
    const warnings: string[] = [...trust.warnings];

    if (unit.bytes && unit.att) {
      const verdict = evaluateMime(unit.bytes, unit.att.mime_declared as string);
      if (verdict.mismatch) warnings.push("mime_nesklad");

      if (!verdict.allowed) {
        await supabase
          .from("inbound_attachments")
          .update({
            scan_status: "karantena",
            mime_sniffed: verdict.sniffed,
            quarantine_reason: verdict.quarantineReason,
          })
          .eq("id", unit.attachmentId as string);
        continue;
      }

      // Transportni dedup — isti sadržaj istog vlasnika se NE obrađuje ponovno.
      const sha = unit.att.content_sha256 as string | null;
      if (sha) {
        const { data: dup } = await supabase
          .from("document_ingest_items")
          .select("id")
          .eq("owner_user_id", ownerId)
          .eq("dedup_identity", `sha256:${sha}`)
          .limit(1)
          .maybeSingle();
        if (dup) {
          await upsertIngestItem(supabase, {
            messageId,
            attachmentId: unit.attachmentId,
            row: {
              source: "mail",
              scope_type: "user",
              scope_id: ownerId,
              owner_user_id: ownerId,
              classification: "duplikat_privitka",
              status: "odbaceno",
              reason: "duplikat_privitka",
              duplicate_of_item_id: dup.id,
              dedup_identity: `sha256:${sha}`,
              warnings: ["duplikat_privitka"],
              ai_calls: 0,
            },
          });

          await supabase
            .from("inbound_attachments")
            .update({ scan_status: "siguran", mime_sniffed: verdict.sniffed })
            .eq("id", unit.attachmentId as string);
          continue;
        }
      }

      if (verdict.sniffed === "pdf") {
        const pages = evaluatePdfPages(unit.bytes);
        if (pages.incomplete) {
          warnings.push("pdf_nepotpun");
          forcedConfidence = "niska";
        }
        await supabase
          .from("inbound_attachments")
          .update({
            scan_status: "siguran",
            mime_sniffed: "pdf",
            page_count: pages.pageCount,
            incomplete: pages.incomplete,
          })
          .eq("id", unit.attachmentId as string);
      } else if (verdict.sniffed === "xml") {
        const text = new TextDecoder().decode(unit.bytes);
        const safety = inspectXml(text);
        if (!safety.safe) {
          await supabase
            .from("inbound_attachments")
            .update({
              scan_status: "karantena",
              mime_sniffed: "xml",
              quarantine_reason: safety.reason,
            })
            .eq("id", unit.attachmentId as string);
          continue;
        }
        xml = text;
        await supabase
          .from("inbound_attachments")
          .update({ scan_status: "siguran", mime_sniffed: "xml" })
          .eq("id", unit.attachmentId as string);
      } else {
        await supabase
          .from("inbound_attachments")
          .update({ scan_status: "siguran", mime_sniffed: verdict.sniffed })
          .eq("id", unit.attachmentId as string);
      }
      sniffed = verdict.sniffed as ClassifyInput["sniffed"];
    }

    const input: ClassifyInput = {
      sniffed,
      xml,
      fromHeader: msg.from_header as string | null,
      subject: msg.subject as string | null,
      bodyText,
      links,
      googleAuthenticated: isAuthenticatedGoogle({
        spf: msg.spf_result,
        dkim: msg.dkim_result,
        fromHeader: msg.from_header as string | null,
      }),
      knownOibs: oibs,
      knownSenders: [],
      searchText: String(unit.att?.storage_path ?? ""),
    };

    // Kvota se traži TEK ako bi obrada mogla trošiti AI/obradu.
    // Verifikacijske poruke prolaze bez kvote — zato se prvo klasificira
    // determinističkim koracima, a AI se ubacuje tek nakon provjere kvote.
    const cheap = await classifyDocument(input, { parseUbl, analyzeWithAi: undefined });

    let result = cheap;
    if (cheap.route === "nepoznato") {
      const { data: quota } = await supabase.rpc("mail_import_quota_status", {
        p_user_id: ownerId,
      });
      const q = quota as Record<string, unknown> | null;
      if (q && q.allowed === false) {
        await supabase
          .from("inbound_messages")
          .update({ status: "ceka_kvotu", last_error: "kvota_iscrpljena" })
          .eq("id", messageId);
        return;
      }
      const capBlocked = await checkAiCostCap(supabase);
      if (capBlocked) {
        await supabase
          .from("inbound_messages")
          .update({ status: "ceka_kvotu", last_error: "ai_cap_reached" })
          .eq("id", messageId);
        return;
      }
      await supabase.rpc("mail_import_consume_quota", { p_user_id: ownerId, p_count: 1 });
      result = await classifyDocument(input, { parseUbl, analyzeWithAi: aiAnalyze });
      if (result.aiCalls > 0) await recordAiCost(supabase, AI_ROUTE);
    }

    const extraction = (result.extraction ?? {}) as Record<string, unknown>;
    const oib = String(extraction.supplier_oib ?? "");
    if (oib && extraction.iban) {
      const ibanCheck = checkIbanAgainstHistory(
        String(extraction.iban),
        byOib.get(oib) ?? [],
      );
      warnings.push(...ibanCheck.warnings);
    }

    const confidence = lowerConfidence(result.confidence, forcedConfidence);
    const status =
      result.classification === "nije_za_nas" || result.classification === "nepoznato"
        ? "nije_za_nas"
        : "na_pregledu";

    const upserted = await upsertIngestItem(supabase, {
      messageId,
      attachmentId: unit.attachmentId,
      row: {
        source: "mail",
        scope_type: "user",
        scope_id: ownerId,
        owner_user_id: ownerId,
        classification: result.classification,
        extraction: result.extraction,
        confidence,
        status,
        doc_type: result.docType,
        trust_level: trust.level,
        warnings: [...new Set([...warnings, ...result.warnings])],
        ai_calls: result.aiCalls,
        dedup_identity: unit.att?.content_sha256
          ? `sha256:${unit.att.content_sha256}`
          : null,
      },
    });

    // Obavijest samo za STVARNO novu stavku — ponovna obrada ne zvoni opet.
    if (upserted.id && upserted.action === "inserted" && status === "na_pregledu") {
      await supabase.from("notifications").insert({
        user_id: ownerId,
        type: "mail_document_pending",
        title_key: "notifications.mail.pending.title",
        body_key: "notifications.mail.pending.body",
        dedup_ref: `mail_item:${upserted.id}`,
        data: { item_id: upserted.id, priority: result.priority },
      });
    }

  }

  await supabase
    .from("inbound_messages")
    .update({ status: "zavrsena", processed_at: new Date().toISOString(), last_error: null })
    .eq("id", messageId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: jobs, error } = await supabase.rpc("mail_ingest_claim_jobs", { p_limit: 5 });
    if (error) {
      console.error("[mail-process] preuzimanje poslova nije uspjelo", error);
      return json({ error: "claim_failed" }, 500);
    }

    const claimed = (jobs ?? []) as Array<{ job_id: string; message_id: string }>;
    let ok = 0;
    let failed = 0;

    for (const job of claimed) {
      try {
        await processMessage(supabase, job.message_id);
        await supabase.rpc("mail_ingest_finish_job", { p_job_id: job.job_id, p_ok: true });
        ok += 1;
      } catch (e) {
        const message = (e as Error)?.message ?? "unknown";
        console.error("[mail-process] posao pao", job.job_id, message);
        await supabase.rpc("mail_ingest_finish_job", {
          p_job_id: job.job_id,
          p_ok: false,
          p_error: message,
        });
        failed += 1;
      }
    }

    return json({ ok: true, claimed: claimed.length, processed: ok, failed });
  } catch (e) {
    console.error("[mail-process] unhandled", e);
    return json({ error: (e as Error)?.message ?? "unknown" }, 500);
  }
});
