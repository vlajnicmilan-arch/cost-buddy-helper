/**
 * eRačun v1 — pravila prihvaćanja dokumenta.
 *
 * Namjerna granica prvog kruga:
 * - prolaze tipovi 380 i 394,
 * - 381 (odobrenje) prolazi, ali s negativnim iznosom,
 * - svaki drugi tip se ODBIJA s jasnom porukom,
 * - prolazi samo valuta EUR; svaka druga se odbija.
 *
 * Digitalni potpis se NE provjerava — svjesna odluka prvog kruga (vidi
 * napomenu u `parseUbl.ts`).
 */

import type { EracunInvoice } from './types';

export type EracunRejectReason =
  | 'unsupported_doc_type'
  | 'unsupported_currency'
  | 'missing_total'
  | 'missing_supplier'
  | 'missing_invoice_number';

export interface EracunAcceptance {
  accepted: boolean;
  /** i18n ključ pod `eracun.reject.*`. */
  reason?: EracunRejectReason;
  params?: Record<string, string | number>;
  /** Iznos koji se sprema (negativan kod 381). */
  amount?: number;
  /** Prikaz upozorenja i kad je dokument prihvaćen (npr. odobrenje). */
  isCreditNote: boolean;
}

const ACCEPTED_DOC_TYPES = new Set(['380', '394', '381']);

export const evaluateInvoice = (invoice: EracunInvoice): EracunAcceptance => {
  const isCreditNote = invoice.docType === '381';
  const raw = invoice.docTypeRaw ?? invoice.docType;

  if (!ACCEPTED_DOC_TYPES.has(raw)) {
    return { accepted: false, reason: 'unsupported_doc_type', params: { docType: raw }, isCreditNote };
  }
  if ((invoice.currency || '').toUpperCase() !== 'EUR') {
    return { accepted: false, reason: 'unsupported_currency', params: { currency: invoice.currency }, isCreditNote };
  }
  if (invoice.suggestedAmount == null) {
    return { accepted: false, reason: 'missing_total', isCreditNote };
  }
  if (!invoice.supplier.oib) {
    return { accepted: false, reason: 'missing_supplier', isCreditNote };
  }
  if (!invoice.invoiceNumber) {
    return { accepted: false, reason: 'missing_invoice_number', isCreditNote };
  }

  return { accepted: true, amount: invoice.suggestedAmount, isCreditNote };
};
