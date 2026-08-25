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
import { extractAuthSignals } from "../_shared/mailImport/mailHeaders.ts";
import { checkIbanAgainstHistory } from "../_shared/mailImport/ibanCheck.ts";
import {
  classifyDocument,
  lowerConfidence,
  needsAiEnrichment,
  hasExtractableText,
  type ClassifyInput,
} from "../_shared/mailImport/classify.ts";
import { parseUbl } from "../_shared/mailImport/parseUblBridge.ts";
import { upsertIngestItem } from "../_shared/mailImport/ingestItemUpsert.ts";
import {
  attachmentTypeLabel,
  isUserFixableQuarantine,
  UNSUPPORTED_ATTACHMENT_CLASSIFICATION,
} from "../_shared/mailImport/quarantineVisibility.ts";
import { resolveTransportDedup } from "../_shared/mailImport/transportDedup.ts";
import { sendPushNotification } from "../_shared/sendPushNotification.ts";


import { checkAiCostCap, recordAiCost } from "../_shared/aiCostCap.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { extractPdfText } from "../_shared/mailImport/pdfText.ts";
import { buildAiRequest } from "../_shared/mailImport/aiRequest.ts";
import { emptyToNull } from "../_shared/mailImport/extractionNormalize.ts";
import { resolveScope, type OwnOibEntry } from "../_shared/mailImport/scopeRouting.ts";
import { extractCustomer, mergeCustomer } from "../_shared/mailImport/customerExtract.ts";
import { resolveDestination } from "../_shared/mailImport/mailDestination.ts";
import { shouldNotifyPending } from "../_shared/mailImport/notifyAgeGuard.ts";
import type { RoutableBusinessProfile } from "../_shared/businessRouting/receiptBusinessRouting.ts";
import {
  findProbableDuplicate,
  PROBABLE_DUPLICATE_WARNING,
} from "../_shared/mailImport/softDuplicate.ts";
import { findPlaceCode } from "../_shared/mailImport/paymentReference.ts";
import { pickSupplierOib } from "../_shared/mailImport/oib.ts";
import {
  memoryFill,
  issuerKeyDomain,
  type IssuerMemoryRow,
} from "../_shared/mailImport/issuerMemory.ts";


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

  // TEKST prvi: multimodalni (file) blok nastaje SAMO za sken bez teksta.
  const plan = buildAiRequest({
    subject: input.subject,
    fromHeader: input.fromHeader,
    bodyText: input.bodyText,
    pdfText: input.pdfText,
    pdfBase64: input.pdfBase64,
    pdfFilename: input.pdfFilename,
  });
  if (plan.multimodal) console.warn("[mail-process] skupi put: multimodalni PDF (sken bez teksta)");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: plan.content }],
      response_format: { type: "json_object" },
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
    // '' -> null: model prepisuje prazan predlozak i tako laze da polje postoji.
    extraction: emptyToNull(parsed),
    confidence: (["visoka", "srednja", "niska"].includes(String(parsed.confidence))
      ? String(parsed.confidence)
      : "srednja") as "visoka" | "srednja" | "niska",
  };
}

/**
 * Poslovni profili vlasnika aliasa — na tudjem racunu smo KUPAC, ne izdavatelj.
 * JEDAN izvor istine: i usmjeravanje po kupcu (`resolveDestination`) i rezerva
 * (`resolveScope`) i filtriranje vlastitih OIB-a IZVODE se iz ovog popisa.
 */
async function ownProfilesFor(
  supabase: Supa,
  userId: string,
): Promise<RoutableBusinessProfile[]> {
  const { data } = await supabase
    .from("business_profiles")
    .select("id, company_name, oib")
    .eq("user_id", userId);
  return ((data ?? []) as Array<{ id: string; company_name: string | null; oib: string | null }>)
    .map((r) => ({ id: r.id, name: r.company_name ?? "", oib: r.oib ?? null }));
}

/** Goli par (oib, profileId) za rezervno usmjeravanje po tekstu. */
function ownOibEntriesFrom(profiles: readonly RoutableBusinessProfile[]): OwnOibEntry[] {
  return profiles
    .map((p) => ({ profileId: p.id, oib: (p.oib ?? "").replace(/[^0-9]/g, "") }))
    .filter((e) => e.oib.length === 11);
}

/**
 * Domene VLASNIKA (adrese njegovih tvrtki) — forwarder brana ih izbacuje iz
 * ključa pamćenja: proslijeđena poruta ne identificira izdavatelja.
 */
async function ownDomainsFor(supabase: Supa, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("business_profiles")
    .select("email")
    .eq("user_id", userId);
  return ((data ?? []) as Array<{ email: string | null }>)
    .map((r) => (r.email ?? "").split("@")[1]?.trim().toLowerCase() ?? "")
    .filter((d) => d.length > 0);
}

/** Pamćenje izdavatelja i mjesta — SAMO redci vlasnika (service role klijent). */
async function issuerMemoryFor(supabase: Supa, userId: string): Promise<IssuerMemoryRow[]> {
  const { data, error } = await supabase
    .from("mail_issuer_memory")
    .select("from_domain, supplier_oib, place_code, supplier_name, place_label, confirmed_count, known_ibans")
    .eq("user_id", userId)
    .limit(500);
  if (error) {
    console.warn("[mail-process] pamćenje izdavatelja nedostupno", error.message);
    return [];
  }
  return (data ?? []) as unknown as IssuerMemoryRow[];
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

/** Adresa iz `From` zaglavlja, malim slovima — bez imena i zagrada. */
export function senderEmail(fromHeader: string | null | undefined): string {
  const m = (fromHeader ?? "").toLowerCase().match(/([^\s<>,;]+@[^\s<>,;]+)/);
  return m ? m[1] : "";
}

/**
 * OBAVIJEST „dokument čeka pregled" — JEDNO mjesto istine (dedup po stavci,
 * samogašenje kroz DB okidač). Koriste je i dokumenti i karantena-kartica.
 */
async function notifyPending(supabase: Supa, ownerId: string, itemId: string, priority: boolean) {
  const { error: notifError } = await supabase.from("notifications").insert({
    user_id: ownerId,
    type: "mail_document_pending",
    title: "notifications.mail.pending.title",
    message: "notifications.mail.pending.body",
    data: {
      item_id: itemId,
      priority,
      route: "/dokumenti",
      fallback_route: "/dokumenti",
      title_vars: {},
      message_vars: {},
    },
    dedup_key: `mail_document_pending:${itemId}`,
  });
  // 23505 = već postoji živa obavijest za istu stavku (dedup), nije kvar.
  if (notifError && notifError.code !== "23505") {
    console.error("[mail-process] upis obavijesti nije uspio", notifError.message, notifError);
  }

  try {
    await sendPushNotification({
      user_id: ownerId,
      title: "notifications.mail.pending.title",
      body: "notifications.mail.pending.body",
      data: {
        type: "mail_document_pending",
        category: "pending",
        route: "/dokumenti",
        item_id: itemId,
        i18n_title_key: "notifications.mail.pending.title",
        i18n_body_key: "notifications.mail.pending.body",
      },
      source: "mail-process",
    });
  } catch (pushErr) {
    console.error("[mail-process] push nije poslan", pushErr);
  }
}

/**
 * TIHA OBAVIJEST NA DUPLIKAT — informacija, ne uzbuna.
 *
 * Kvar iz života (19.8.2026): korisnik je drugi put ovoga tjedna proslijedio
 * isti izvadak jer je mislio da pošta NIJE stigla. Lijevak je ispravno odbacio
 * duplikat, ali je šutio. Od sada duplikat GOVORI: in-app zapis bez pusha, bez
 * kartice na pregledu, dedup po PORUCI (isti mail ne javlja dvaput).
 */
async function notifyDuplicate(
  supabase: Supa,
  ownerId: string,
  messageId: string,
  subject: string | null,
): Promise<void> {
  const title = (subject ?? "").trim();
  const { error } = await supabase.from("notifications").insert({
    user_id: ownerId,
    type: "mail_document_duplicate",
    severity: "info",
    title: "notifications.mail.duplicate.title",
    message: title
      ? "notifications.mail.duplicate.body"
      : "notifications.mail.duplicate.bodyNoSubject",
    data: {
      message_id: messageId,
      route: "/dokumenti",
      fallback_route: "/dokumenti",
      title_vars: {},
      message_vars: title ? { subject: title } : {},
    },
    dedup_key: `mail_document_duplicate:${messageId}`,
  });
  // 23505 = isti mail je već javljen (dedup), nije kvar.
  if (error && error.code !== "23505") {
    console.error("[mail-process] obavijest o duplikatu nije upisana", error.message);
  }
  // NAMJERNO BEZ PUSHA: duplikat je informacija, ne poziv na radnju.
}

/**
 * ŽIVOTNI CIKLUS GMAIL POTVRDE — treće stanje.
 * Prvi stvarni mail s adrese koju je korisnik dao Googleu na prosljeđivanje
 * TRAJNO zatvara njegovu potvrdu. Podudaranje je po TOČNO izdvojenoj adresi
 * pošiljatelja, nikad po naslovu ni djelomičnom tekstu.
 */
async function closeVerificationOnFirstMail(
  supabase: Supa,
  ownerId: string,
  fromHeader: string | null,
): Promise<void> {
  const sender = senderEmail(fromHeader);
  if (sender === "") return;
  const { data } = await supabase
    .from("document_ingest_items")
    .select("id, extraction")
    .eq("owner_user_id", ownerId)
    .eq("classification", "verifikacija_prosljedjivanja")
    .eq("status", "ceka_prvi_mail");
  for (const row of (data ?? []) as Array<{ id: string; extraction: Record<string, unknown> | null }>) {
    const address = String((row.extraction ?? {}).forwardedAddress ?? "").trim().toLowerCase();
    if (address !== "" && address === sender) {
      await supabase
        .from("document_ingest_items")
        .update({ status: "potvrdjen", updated_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }
}

/** Korisnikova zapamćena odluka o vrsti dokumenta za (poruka, privitak). */
async function userClassificationFor(
  supabase: Supa,
  messageId: string,
  attachmentId: string | null,
): Promise<"racun" | "izvod" | null> {
  let query = supabase
    .from("document_ingest_items")
    .select("classification, classification_set_by_user")
    .eq("message_id", messageId);
  query = attachmentId ? query.eq("attachment_id", attachmentId) : query.is("attachment_id", null);
  const { data } = await query.limit(1);
  const row = (data ?? [])[0] as
    | { classification: string | null; classification_set_by_user: boolean | null }
    | undefined;
  if (!row || row.classification_set_by_user !== true) return null;
  return row.classification === "racun" || row.classification === "izvod"
    ? (row.classification as "racun" | "izvod")
    : null;
}


async function processMessage(
  supabase: Supa,
  messageId: string,
  options: { manualReprocess?: boolean } = {},
): Promise<void> {
  const { data: msg, error: msgErr } = await supabase
    .from("inbound_messages")
    .select("*")
    .eq("id", messageId)
    .single();
  if (msgErr || !msg) throw new Error("poruka_ne_postoji");

  const ownerId = msg.owner_user_id as string;

  // BRANA ZVONA: automatska obrada zvoni SAMO za svježu poštu (24 h). Ručni
  // reprocess je izričita korisnikova radnja i uvijek smije zazvoniti.
  const notifyAllowed = shouldNotifyPending({
    receivedAt: msg.received_at as string | null,
    now: Date.now(),
    manualReprocess: options.manualReprocess === true,
  });

  // Prvi stvarni mail s adrese koju čeka Gmail potvrda zatvara tu potvrdu.
  await closeVerificationOnFirstMail(supabase, ownerId, msg.from_header as string | null);


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
  // Signali autentičnosti iz SIROVIH zaglavlja — koriste se samo za ogradu
  // Gmailove potvrde prosljeđivanja (vidi mailHeaders.ts).
  let rawAuth = {
    spf: msg.spf_result as string | null,
    dkim: msg.dkim_result as string | null,
    arc: msg.arc_result as string | null,
    dmarc: msg.dmarc_result as string | null,
    originalAuthResults: null as string | null,
  };
  if (msg.body_storage_path) {
    const { data: blob } = await supabase.storage
      .from("inbound-mail")
      .download(msg.body_storage_path as string);
    if (blob) {
      const raw = JSON.parse(await blob.text()) as Record<string, string>;
      const signals = extractAuthSignals(raw);
      rawAuth = {
        spf: (msg.spf_result as string | null) ?? signals.spf,
        dkim: (msg.dkim_result as string | null) ?? signals.dkim,
        arc: (msg.arc_result as string | null) ?? signals.arc,
        dmarc: (msg.dmarc_result as string | null) ?? signals.dmarc,
        originalAuthResults: signals.originalAuthResults,
      };
      const html = raw["body-html"] ?? raw["stripped-html"] ?? "";
      const plain = raw["body-plain"] ?? raw["stripped-text"] ?? "";
      bodyText = plain || htmlToText(html);
      links = extractLinks(html || plain);
    }
  }

  const { byOib, oibs } = await knownCounterparties(supabase, ownerId);
  const ownProfiles = await ownProfilesFor(supabase, ownerId);
  const ownOibEntries = ownOibEntriesFrom(ownProfiles);
  const ownOibs = ownOibEntries.map((e) => e.oib);
  const ownDomains = await ownDomainsFor(supabase, ownerId);
  const memoryRows = await issuerMemoryFor(supabase, ownerId);


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
    let pdfText = "";
    let pdfBase64: string | null = null;
    let pdfFilename: string | null = null;
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

        // KARANTENA GOVORI: format koji korisnik MOŽE ispraviti dobiva vidljivu
        // karticu i obavijest. Sigurnosni razlozi (sadržaj) ostaju tihi.
        if (isUserFixableQuarantine(verdict.quarantineReason)) {
          const scope = resolveScope({ text: "", ownOibs: ownOibEntries, ownerId });
          const quarantined = await upsertIngestItem(supabase, {
            messageId,
            attachmentId: unit.attachmentId,
            row: {
              source: "mail",
              scope_type: scope.scopeType,
              scope_id: scope.scopeId,
              owner_user_id: ownerId,
              classification: UNSUPPORTED_ATTACHMENT_CLASSIFICATION,
              extraction: {
                attachment_type: attachmentTypeLabel(
                  unit.att.mime_declared as string | null,
                  verdict.sniffed,
                ),
                quarantine_reason: verdict.quarantineReason,
              },
              confidence: "niska",
              status: "na_pregledu",
              reason: verdict.quarantineReason,
              trust_level: trust.level,
              warnings: ["privitak_nepodrzan"],
              ai_calls: 0,
            },
          });
          const entered =
            quarantined.id &&
            (quarantined.action === "inserted" ||
              (quarantined.action === "updated" && quarantined.previousStatus !== "na_pregledu"));
          if (entered && notifyAllowed) {
            await notifyPending(supabase, ownerId, quarantined.id as string, false);
          }
        }
        continue;
      }




      if (verdict.sniffed === "pdf") {
        const pages = evaluatePdfPages(unit.bytes);
        if (pages.incomplete) {
          warnings.push("pdf_nepotpun");
          forcedConfidence = "niska";
        }
        // BESPLATNO prije AI-ja: tekstualni sloj PDF-a (prvih 10 stranica).
        const pdf = await extractPdfText(unit.bytes);
        pdfText = pdf.text;
        if (pdf.isScan) {
          warnings.push("pdf_bez_teksta");
          // Sken je jedini put koji smije ici multimodalno.
          pdfBase64 = encodeBase64(unit.bytes);
          pdfFilename = String(unit.att.storage_path ?? "dokument.pdf").split("/").pop() ?? "dokument.pdf";
        }
        await supabase
          .from("inbound_attachments")
          .update({
            scan_status: "siguran",
            mime_sniffed: "pdf",
            page_count: pages.pageCount,
            incomplete: pages.incomplete,
            extracted_text: pdfText.slice(0, 200000) || null,
            has_text_layer: !pdf.isScan,
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

    // USMJERAVANJE — jednom po jedinici, nad cijelim poznatim tekstom.
    // Nas OIB u dokumentu = dokument pripada toj tvrtki. Atribucija
    // (owner_user_id, kvota, obavijesti) ostaje na vlasniku aliasa.
    const unitScope = resolveScope({
      text: [bodyText ?? "", pdfText ?? "", xml ?? ""].join("\n"),
      ownOibs: ownOibEntries,
      ownerId,
    });
    warnings.push(...unitScope.warnings);

    // Transportni dedup — vrata SAMO za privitke koji se prvi put vide.
    // Reprocess (stavka za (message_id, attachment_id) već postoji) je
    // OSVJEŽENJE i preskače dedup u cijelosti; odbačena kopija ne sudi originalu.
    const sha = (unit.att?.content_sha256 as string | null) ?? null;
    const dedup = await resolveTransportDedup(supabase, {
      ownerId,
      messageId,
      attachmentId: unit.attachmentId,
      sha,
    });
    if (dedup.kind === "duplicate") {
      await upsertIngestItem(supabase, {
        messageId,
        attachmentId: unit.attachmentId,
        row: {
          source: "mail",
          scope_type: unitScope.scopeType,
          scope_id: unitScope.scopeId,
          owner_user_id: ownerId,
          classification: "duplikat_privitka",
          status: "odbaceno",
          reason: "duplikat_privitka",
          duplicate_of_item_id: dedup.anchorId,
          dedup_identity: `sha256:${sha}`,
          warnings: ["duplikat_privitka"],
          ai_calls: 0,
        },
      });
      // Odbačeno ostaje odbačeno — ali korisnik mora ZNATI da je pošta stigla.
      if (notifyAllowed) {
        await notifyDuplicate(supabase, ownerId, messageId, msg.subject as string | null);
      }
      continue;
    }


    // Ponovna obrada NE pregazi korisnikovu odluku o vrsti dokumenta.
    const userClassification = await userClassificationFor(supabase, messageId, unit.attachmentId);

    const input: ClassifyInput = {
      userClassification,
      sniffed,
      xml,
      fromHeader: msg.from_header as string | null,
      subject: msg.subject as string | null,
      bodyText,
      pdfText,
      pdfBase64,
      pdfFilename,
      links,
      googleAuthenticated: isAuthenticatedGoogle({
        ...rawAuth,
        fromHeader: msg.from_header as string | null,
      }),
      knownOibs: oibs,
      ownOibs,
      knownSenders: [],
      searchText: String(unit.att?.storage_path ?? ""),
    };

    // Kvota se traži TEK ako bi obrada mogla trošiti AI/obradu.
    // Verifikacijske poruke prolaze bez kvote — zato se prvo klasificira
    // determinističkim koracima, a AI se ubacuje tek nakon provjere kvote.
    const cheap = await classifyDocument(input, { parseUbl, analyzeWithAi: undefined });

    // PAMĆENJE IZDAVATELJA I MJESTA — sloj dopune IZMEĐU jeftine klasifikacije
    // i odluke o AI pozivu. Pogodak popunjava rupe pa `needsAiEnrichment`
    // često ugasi AI poziv. Pouzdanost se NE diže; stavka ostaje na pregledu.
    const memoryText = [bodyText, pdfText].filter(Boolean).join("\n");
    const placeCode = findPlaceCode(memoryText).placeCode;
    // Kandidati za razrješenje iz pamćenja — kandidat MORA doslovno postojati
    // u dokumentu, pa je presjek s pamćenjem siguran po konstrukciji.
    const oibCandidates = pickSupplierOib(memoryText, ownOibs).candidates;
    let memoryKnownIbans: string[] = [];
    const applyMemory = (r: typeof cheap) => {
      const filled = memoryFill({
        extraction: r.extraction,
        placeCode,
        fromDomain: issuerKeyDomain(msg.from_header as string | null, ownDomains),
        rows: memoryRows,
        // UBL je već deterministički potpun — smije dobiti SAMO oznaku mjesta.
        onlyPlaceLabel: r.route === "ubl",
        oibCandidates,
      });
      if (filled.knownIbans.length > 0) memoryKnownIbans = filled.knownIbans;
      return filled;
    };

    const cheapMemory = applyMemory(cheap);
    warnings.push(...cheapMemory.warnings);

    let result = { ...cheap, extraction: cheapMemory.extraction };
    // AI se trazi kad jeftina grana nije odlucila ILI kad je odlucila, ali su
    // kljucna polja ostala prazna (pametna dopuna). Potpuna stavka = 0 poziva.
    const wantsAi =
      result.route === "nepoznato" ||
      (result.route === "heuristika" &&
        needsAiEnrichment(result.extraction, hasExtractableText(input), result.classification));

    if (wantsAi) {
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
      const withAi = await classifyDocument(input, { parseUbl, analyzeWithAi: aiAnalyze });
      const aiMemory = applyMemory(withAi);
      warnings.push(...aiMemory.warnings);
      result = { ...withAi, extraction: aiMemory.extraction };
      if (result.aiCalls > 0) await recordAiCost(supabase, AI_ROUTE);

    }

    const extraction = (result.extraction ?? {}) as Record<string, unknown>;

    // KUPAC S DOKUMENTA — deterministički iz teksta, AI samo za rupe.
    // Iz kupca se izvodi ODREDIŠTE; izvor adrese ostaje samo rezerva.
    const customer = mergeCustomer(
      extractCustomer({
        text: [bodyText ?? "", pdfText ?? "", xml ?? ""].join("\n"),
        ownOibs,
      }),
      extraction,
    );
    if (result.extraction) {
      extraction.recipient_oib = customer.recipient_oib;
      extraction.recipient_name = customer.recipient_name;
    }

    const destination = resolveDestination({
      recipientOib: customer.recipient_oib,
      recipientName: customer.recipient_name,
      profiles: ownProfiles,
      fallback: { scopeType: unitScope.scopeType, scopeId: unitScope.scopeId },
    });
    warnings.push(...destination.warnings);
    if (result.extraction) {
      extraction.destination_source = destination.source;
      extraction.destination_offer_profile_id = destination.offer?.profileId ?? null;
      extraction.destination_offer_profile_name = destination.offer?.profileName ?? null;
    }

    const oib = String(extraction.supplier_oib ?? "");
    if (oib && extraction.iban) {
      // JEDAN MOZAK: povijest IBAN-a = potvrđeni računi + IBAN-i zapamćeni uz
      // TOG izdavatelja. Novi IBAN poznatog izdavatelja = jak alarm.
      const ibanCheck = checkIbanAgainstHistory(
        String(extraction.iban),
        [...(byOib.get(oib) ?? []), ...memoryKnownIbans],
      );
      warnings.push(...ibanCheck.warnings);
    }

    // MEKA DEDUP NAJAVA — samo upozorenje, nista se ne odbacuje.
    if (
      await findProbableDuplicate(supabase, {
        supplierOib: extraction.supplier_oib as string | null,
        invoiceNumber: extraction.invoice_number as string | null,
        docType: result.docType as string | null,
        totalAmount: extraction.total_amount as number | string | null,
        dueDate: extraction.due_date as string | null,
        issueDate: extraction.issue_date as string | null,
        scopeType: destination.scopeType,
        scopeId: destination.scopeId,
        ownerUserId: ownerId,
      })
    ) {
      warnings.push(PROBABLE_DUPLICATE_WARNING);
    }

    const confidence = lowerConfidence(result.confidence, forcedConfidence);
    // Nesigurno nikad ne nestaje: `mozda_izvod` ostaje u ljudskom redu odluke.
    const status = result.needsHumanChoice === true
      ? "na_pregledu"
      : result.classification === "nije_za_nas" || result.classification === "nepoznato"
        ? "nije_za_nas"
        : "na_pregledu";

    // PAMĆENJE ODBIJANJA — ista vrsta poruke od istog pošiljatelja, odbačena
    // DVAPUT, treći put ne gnjavi: ide izravno u odbačeno, uz zapis razloga.
    // Ništa se ne briše — korisnik stavku može vratiti u red.
    let finalStatus = status;
    let mutedReason: string | null = null;
    if (status === "na_pregledu") {
      const { data: muted, error: mutedErr } = await supabase.rpc("mail_reject_muted", {
        p_user_id: ownerId,
        p_from_header: (msg.from_header as string | null) ?? "",
        p_subject: (msg.subject as string | null) ?? "",
        p_has_attachment: unit.attachmentId !== null,
        p_classification: result.classification,
      });
      if (mutedErr) {
        console.warn("[mail-process] provjera naučenog odbijanja nije uspjela", mutedErr.message);
        await supabase.from("app_diagnostics_logs").insert({
          event: "mail_reject_memory_check_failed",
          user_id: ownerId,
          session_id: "mail-process",
          details: { message_id: messageId, attachment_id: unit.attachmentId, error: mutedErr.message },
        });
      } else if (muted === true) {
        finalStatus = "odbaceno";
        mutedReason = "nauceno_odbijanje";
        warnings.push("nauceno_odbijanje");
      }
    }

    const upserted = await upsertIngestItem(supabase, {
      messageId,
      attachmentId: unit.attachmentId,
      row: {
        source: "mail",
        scope_type: destination.scopeType,
        scope_id: destination.scopeId,
        owner_user_id: ownerId,
        classification: result.classification,
        extraction: result.extraction,
        confidence,
        status: finalStatus,
        reason: mutedReason,
        doc_type: result.docType,
        trust_level: trust.level,
        warnings: [...new Set([...warnings, ...result.warnings])],
        ai_calls: result.aiCalls,
        dedup_identity: unit.att?.content_sha256
          ? `sha256:${unit.att.content_sha256}`
          : null,
      },
    });

    // Obavijest za STVARNO novu stavku i za PRIJELAZ u ljudski red: stavka koja
    // je nakon popravka lijevka iz tihog `nije_za_nas` došla na pregled mora
    // zazvoniti, inače korisnik i dalje ne vidi ništa. Ponovna obrada stavke
    // koja je već bila na pregledu NE zvoni opet.
    const enteredReview =
      finalStatus === "na_pregledu" &&
      (upserted.action === "inserted" ||
        (upserted.action === "updated" && upserted.previousStatus !== "na_pregledu"));
    if (upserted.id && enteredReview && notifyAllowed) {
      await notifyPending(supabase, ownerId, upserted.id as string, result.priority);
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
    // 1) Zombiji prvo: posao 'u_obradi' stariji od 15 min tretira se kao pao.
    //    Bez ovoga zaglavljeni posao visi zauvijek (kvar iz kolovoza 2026).
    const { data: reaped, error: reapErr } = await supabase.rpc("mail_ingest_reap_stuck_jobs", {
      p_older_minutes: 15,
    });
    if (reapErr) console.warn("[mail-process] reaper nije uspio", reapErr.message);

    const { data: jobs, error } = await supabase.rpc("mail_ingest_claim_jobs", { p_limit: 5 });
    if (error) {
      console.error("[mail-process] preuzimanje poslova nije uspjelo", error);
      return json({ error: "claim_failed" }, 500);
    }

    const claimed = (jobs ?? []) as Array<{ job_id: string; message_id: string; manual?: boolean }>;
    let ok = 0;
    let failed = 0;

    for (const job of claimed) {
      // Posao MORA završiti u terminalnom stanju. `settled` + finally jamče da
      // ni iznimka ni rani return ne ostave posao u 'u_obradi'.
      let settled = false;
      try {
        await processMessage(supabase, job.message_id, { manualReprocess: job.manual === true });
        await supabase.rpc("mail_ingest_finish_job", { p_job_id: job.job_id, p_ok: true });
        settled = true;
        ok += 1;
      } catch (e) {
        const message = (e as Error)?.message ?? "unknown";
        console.error("[mail-process] posao pao", job.job_id, message);
        await supabase.rpc("mail_ingest_finish_job", {
          p_job_id: job.job_id,
          p_ok: false,
          p_error: message,
        });
        settled = true;
        failed += 1;
      } finally {
        if (!settled) {
          console.error("[mail-process] posao nije zatvoren — prisilno neuspjeo", job.job_id);
          await supabase.rpc("mail_ingest_finish_job", {
            p_job_id: job.job_id,
            p_ok: false,
            p_error: "worker_prekinut",
          });
        }
      }
    }

    return json({ ok: true, reaped: reaped ?? 0, claimed: claimed.length, processed: ok, failed });

  } catch (e) {
    console.error("[mail-process] unhandled", e);
    return json({ error: (e as Error)?.message ?? "unknown" }, 500);
  }
});
