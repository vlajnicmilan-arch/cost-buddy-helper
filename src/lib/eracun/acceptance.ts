/**
 * eRačun v1 — pravila prihvaćanja dokumenta.
 *
 * Granica modela:
 * - normalni pozitivni računi: 380, 82 (mjerene usluge — struja/plin/voda),
 *   875/876/877 (građevinske situacije), 394 (leasing), 389 (samoizdani),
 *   393 (faktoring),
 * - 381 (odobrenje) prolazi s negativnim iznosom,
 * - 384 (ispravak) i 386 (avans) prolaze, ali s vidljivim upozorenjem,
 * - nepoznat tip NE odbijamo: označava se „za odluku" i korisnik sam bira
 *   hoće li ga uvesti (tiho odbijanje legitimnog računa je gora greška),
 * - valuta ≠ EUR se odbija — to je stvarno ograničenje modela.
 *
 * Digitalni potpis se NE provjerava — svjesna odluka prvog kruga (vidi
 * napomenu u `parseUbl.ts`).
 */

import type { EracunInvoice } from './types';

export type EracunRejectReason =
  | 'unsupported_currency'
  | 'missing_total'
  | 'missing_supplier'
  | 'missing_invoice_number';

/** Upozorenja koja se prikazuju u pregledu prije spremanja. */
export type EracunCautionCode =
  /** 384 — ispravak računa, može duplirati izvorni. */
  | 'correction'
  /** 386 — avansni račun, slijedi konačni; rizik dvostrukog knjiženja. */
  | 'prepayment'
  /** Šifra izvan poznatog popisa — korisnik odlučuje. */
  | 'unknown_doc_type';

export interface EracunCaution {
  code: EracunCautionCode;
  params?: Record<string, string | number>;
}

export interface EracunAcceptance {
  accepted: boolean;
  /** i18n ključ pod `eracun.reject.*`. */
  reason?: EracunRejectReason;
  params?: Record<string, string | number>;
  /** Iznos koji se sprema (negativan kod 381). */
  amount?: number;
  /** Prikaz upozorenja i kad je dokument prihvaćen (npr. odobrenje). */
  isCreditNote: boolean;
  /** Upozorenja uz prihvaćen dokument (`eracun.caution.*`). */
  cautions: EracunCaution[];
  /** Prihvaćen, ali traži svjesnu odluku korisnika (nepoznat tip). */
  needsDecision: boolean;
}

/** Tipovi koji prolaze kao normalan pozitivan račun. */
const POSITIVE_DOC_TYPES = new Set(['380', '82', '875', '876', '877', '394', '389', '393']);
/** Tipovi koji prolaze uz vidljivo upozorenje. */
const CAUTION_DOC_TYPES = new Map<string, EracunCautionCode>([
  ['384', 'correction'],
  ['386', 'prepayment'],
]);
const CREDIT_NOTE_TYPE = '381';

export const evaluateInvoice = (invoice: EracunInvoice): EracunAcceptance => {
  const raw = (invoice.docTypeRaw ?? invoice.docType).trim();
  const isCreditNote = raw === CREDIT_NOTE_TYPE;

  const cautions: EracunCaution[] = [];
  const cautionCode = CAUTION_DOC_TYPES.get(raw);
  if (cautionCode) cautions.push({ code: cautionCode, params: { docType: raw } });

  const known = POSITIVE_DOC_TYPES.has(raw) || isCreditNote || cautionCode !== undefined;
  const needsDecision = !known;
  if (needsDecision) cautions.push({ code: 'unknown_doc_type', params: { docType: raw || '?' } });

  const reject = (reason: EracunRejectReason, params?: Record<string, string | number>): EracunAcceptance => ({
    accepted: false,
    reason,
    params,
    isCreditNote,
    cautions,
    needsDecision,
  });

  if ((invoice.currency || '').toUpperCase() !== 'EUR') {
    return reject('unsupported_currency', { currency: invoice.currency });
  }
  if (invoice.suggestedAmount == null) return reject('missing_total');
  if (!invoice.supplier.oib) return reject('missing_supplier');
  if (!invoice.invoiceNumber) return reject('missing_invoice_number');

  const amount = isCreditNote
    ? -Math.abs(invoice.suggestedAmount)
    : Math.abs(invoice.suggestedAmount);

  return { accepted: true, amount, isCreditNote, cautions, needsDecision };
};
