/**
 * MAIL UVOZ — higijena `extraction` objekta.
 *
 *  1) `'' → null` na IZLAZU iz AI analize: model prepisuje prazan predložak,
 *     pa prazan string laže da polje postoji. Provjere (`nedostaju_polja`,
 *     COALESCE u `mail_item_confirm`) time dobivaju istinu.
 *  2) UBL grana daje UGNIJEŽĐEN rezultat (`supplier.oib`), a `mail_item_confirm`
 *     i UI čitaju PLOSNATE ključeve (`supplier_oib`). Mapiranje je ovdje, na
 *     jednom mjestu.
 *  3) Datumi: hrvatski oblik ("28.02.2026.") iz AI dopune pucao je na INSERT-u.
 *     Svaki izlaz ide kroz `normalizeExtractionDates` — u redu su samo ISO datumi.
 */

import { normalizeExtractionDates } from './dateNormalize.ts';



/** Prazni stringovi (i sami razmaci) postaju `null`, rekurzivno po objektu. */
export function emptyToNull<T extends Record<string, unknown>>(source: T | null | undefined): Record<string, unknown> {
  if (!source) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      out[key] = trimmed.length === 0 ? null : trimmed;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = emptyToNull(value as Record<string, unknown>);
    } else {
      out[key] = value ?? null;
    }
  }
  return out;
}

/** Ključevi koje čitaju `mail_item_confirm` i `MailReviewDialog`. */
export const FLAT_EXTRACTION_KEYS = [
  'supplier_oib',
  'supplier_name',
  'invoice_number',
  'issue_date',
  'due_date',
  'total_amount',
  'vat_amount',
  'currency',
  'iban',
] as const;

/** UBL (`parseUbl`) rezultat → plosnati oblik koji baza i UI razumiju. */
export function flattenUblExtraction(parsed: Record<string, unknown>): Record<string, unknown> {
  const supplier = (parsed.supplier ?? {}) as Record<string, unknown>;
  const customer = (parsed.customer ?? {}) as Record<string, unknown>;

  const total =
    (parsed.payableAmount as number | null) ??
    (parsed.taxInclusiveAmount as number | null) ??
    (parsed.suggestedAmount as number | null) ??
    null;

  const flat: Record<string, unknown> = {
    supplier_oib: (supplier.oib as string | null) ?? null,
    supplier_name: (supplier.name as string | null) ?? null,
    customer_oib: (customer.oib as string | null) ?? null,
    customer_name: (customer.name as string | null) ?? null,
    invoice_number: (parsed.invoiceNumber as string | null) ?? null,
    issue_date: (parsed.issueDate as string | null) ?? null,
    due_date: (parsed.dueDate as string | null) ?? null,
    total_amount: total,
    vat_amount: (parsed.taxAmount as number | null) ?? null,
    currency: (parsed.currency as string | null) ?? 'EUR',
    iban: (parsed.iban as string | null) ?? null,
    payment_reference: (parsed.paymentReference as string | null) ?? null,
    items: Array.isArray(parsed.lines) ? parsed.lines : [],
    // Izvorni UBL ostaje uz plosnata polja — ništa se ne gubi.
    ubl: parsed,
  };

  return emptyToNull(flat);
}

/**
 * Determinizam pobjeđuje AI: polje koje smo dokazali (checksum/mod-97) ne
 * smije biti pregaženo modelskim nagađanjem.
 */
export function mergeDeterministic(
  aiExtraction: Record<string, unknown> | null,
  deterministic: Record<string, unknown>,
): Record<string, unknown> {
  const base = emptyToNull(aiExtraction ?? {});
  for (const [key, value] of Object.entries(deterministic)) {
    if (value !== null && value !== undefined && value !== '') base[key] = value;
    else if (base[key] === undefined) base[key] = null;
  }
  return base;
}
