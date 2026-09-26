/**
 * MAIL UVOZ — JEDAN DOKUMENT = JEDNA STAVKA (ponude).
 *
 * Kvar (rujan 2026): jedna poruka Alfa lidera s 13 privitaka (PDF + slike iste
 * ponude) dala je 13 stavki u redu. Privici iste ponude istog dobavljača
 * vežu se uz jednu glavnu stavku; ništa se ne briše.
 *
 * Ograda: različiti brojevi ponude ostaju zasebne stavke; računi se ovdje ne
 * diraju (račun + potvrda ide kroz `receiptPairing`).
 */

export const OFFER_ATTACHMENT_WARNING = 'prilog_uz_ponudu';

export interface OfferProbe {
  id: string;
  classification: string;
  extraction: Record<string, unknown>;
}

export interface OfferLink {
  attachmentItemId: string;
  mainItemId: string;
}

const LEGAL_SUFFIX = /\b(d\.?\s?o\.?\s?o\.?|j\.?\s?d\.?\s?o\.?\s?o\.?|d\.?\s?d\.?|obrt|gmbh|ltd|inc)\b/gi;

export const supplierKey = (e: Record<string, unknown>): string =>
  String(e.supplier_name ?? '')
    .toLowerCase()
    .replace(LEGAL_SUFFIX, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const filled = (e: Record<string, unknown>): number =>
  ['supplier_oib', 'invoice_number', 'total_amount', 'iban', 'issue_date'].filter(
    (k) => e[k] !== null && e[k] !== undefined && String(e[k]).trim() !== '',
  ).length;

const num = (e: Record<string, unknown>) => String(e.invoice_number ?? '').trim();
const oib = (e: Record<string, unknown>) => String(e.supplier_oib ?? '').replace(/\D/g, '');

/** Grupira ponude iste poruke; vraća veze privitak → glavna stavka. */
export function groupOfferAttachments(items: readonly OfferProbe[]): OfferLink[] {
  const offers = items.filter((i) => i.classification === 'ponuda' && supplierKey(i.extraction) !== '');
  const groups: OfferProbe[][] = [];

  for (const item of offers) {
    const group = groups.find((g) =>
      g.every((m) => {
        if (supplierKey(m.extraction) !== supplierKey(item.extraction)) return false;
        const a = num(m.extraction), b = num(item.extraction);
        if (a && b && a !== b) return false;
        const oa = oib(m.extraction), ob = oib(item.extraction);
        return !(oa && ob && oa !== ob);
      }),
    );
    if (group) group.push(item);
    else groups.push([item]);
  }

  const links: OfferLink[] = [];
  for (const group of groups) {
    if (group.length < 2) continue;
    const main = group.reduce((best, cur) => (filled(cur.extraction) > filled(best.extraction) ? cur : best));
    for (const m of group) if (m.id !== main.id) links.push({ attachmentItemId: m.id, mainItemId: main.id });
  }
  return links;
}
