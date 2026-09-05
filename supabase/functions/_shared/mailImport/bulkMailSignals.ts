/**
 * MAIL UVOZ — OGRADA MASOVNE POŠTE.
 *
 * UZROK (rujan 2026): reklamni newsletter (Alago) prošao je u red „Za pregled"
 * kao „ponuda" s visokom pouzdanošću — klasifikator je iz podnožja izvukao ime
 * i OIB, a iz reklamnog teksta cijene. Nijedno pravilo nije govorilo da masovna
 * pošta nije dokument, a najjači dokaz (`List-Unsubscribe`) nikad se nije
 * spremao.
 *
 * Ovdje su SAMO čiste funkcije: čitanje oznaka masovne pošte iz sirovog
 * Mailgun payloada i dva pravila odbijanja. Čitanje tijela maila i logika
 * izvod/račun se NE diraju.
 */

import { headerPairs } from "./mailHeaders.ts";

export interface BulkMailHeaders {
  listUnsubscribe: string | null;
  listId: string | null;
  precedence: string | null;
  autoSubmitted: string | null;
}

export const EMPTY_BULK_HEADERS: BulkMailHeaders = {
  listUnsubscribe: null,
  listId: null,
  precedence: null,
  autoSubmitted: null,
};

/** Razlozi odbijanja — zapisuju se u dijagnostiku i u `reason` stavke. */
export const BULK_MAIL_REASON = "masovna_posta";
export const NO_AMOUNT_NO_NUMBER_REASON = "bez_iznosa_i_broja";

const clip = (v: string | null): string | null => {
  if (v === null) return null;
  const trimmed = v.trim();
  if (trimmed === "") return null;
  return trimmed.length > 500 ? trimmed.slice(0, 500) : trimmed;
};

/**
 * Oznake masovne pošte iz sirovog payloada. Mailgun ista zaglavlja isporučuje
 * i kao ravna polja (`List-Unsubscribe`) i unutar `message-headers` — čitaju se
 * oba izvora, prvo nađeno vrijedi.
 */
export function extractBulkHeaders(raw: Record<string, unknown> | null): BulkMailHeaders {
  if (!raw) return { ...EMPTY_BULK_HEADERS };
  const pairs = headerPairs(raw);
  const pick = (name: string): string | null => {
    const hit = pairs.find(([k, v]) => k === name && v.trim() !== "");
    return hit ? clip(hit[1]) : null;
  };
  return {
    listUnsubscribe: pick("list-unsubscribe"),
    listId: pick("list-id"),
    precedence: pick("precedence"),
    autoSubmitted: pick("auto-submitted"),
  };
}

const BULK_PRECEDENCE = ["bulk", "list", "junk"];

/** Ima li poruka ijednu nedvosmislenu oznaku masovne/automatske pošte. */
export function hasBulkMarker(h: BulkMailHeaders): boolean {
  if (clip(h.listUnsubscribe) !== null) return true;
  if (clip(h.listId) !== null) return true;
  const precedence = (h.precedence ?? "").trim().toLowerCase();
  if (BULK_PRECEDENCE.includes(precedence)) return true;
  const auto = (h.autoSubmitted ?? "").trim().toLowerCase();
  if (auto !== "" && auto !== "no") return true;
  return false;
}

/**
 * PRAVILO 2 — masovna pošta BEZ IJEDNOG PRIVITKA nije dokument.
 * Uvjet „nema privitka" je obavezan: newsletter s privitkom se i dalje
 * klasificira normalno, jer postoje pošiljatelji koji račun šalju s liste.
 */
export function bulkMailRule(params: {
  headers: BulkMailHeaders;
  hasAttachment: boolean;
}): string | null {
  if (params.hasAttachment) return null;
  return hasBulkMarker(params.headers) ? BULK_MAIL_REASON : null;
}

const isEmptyValue = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/**
 * PRAVILO 3 — privremeno, dok stara pošta nema spremljena zaglavlja:
 * stavka BEZ privitka klasificirana kao `ponuda`/`racun` koja nema NI iznos NI
 * broj računa nije dokument. Uvjet je I (oba nedostaju), nikako ILI.
 */
export function noAmountNoNumberRule(params: {
  hasAttachment: boolean;
  classification: string | null;
  totalAmount: unknown;
  invoiceNumber: unknown;
}): string | null {
  if (params.hasAttachment) return null;
  if (params.classification !== "ponuda" && params.classification !== "racun") return null;
  if (!isEmptyValue(params.totalAmount)) return null;
  if (!isEmptyValue(params.invoiceNumber)) return null;
  return NO_AMOUNT_NO_NUMBER_REASON;
}

/** Oznake nađene na poruci — za dijagnostički zapis (bez sadržaja poruke). */
export function markersFound(h: BulkMailHeaders): string[] {
  const out: string[] = [];
  if (clip(h.listUnsubscribe) !== null) out.push("List-Unsubscribe");
  if (clip(h.listId) !== null) out.push("List-Id");
  const precedence = (h.precedence ?? "").trim().toLowerCase();
  if (BULK_PRECEDENCE.includes(precedence)) out.push(`Precedence=${precedence}`);
  const auto = (h.autoSubmitted ?? "").trim().toLowerCase();
  if (auto !== "" && auto !== "no") out.push(`Auto-Submitted=${auto}`);
  return out;
}
