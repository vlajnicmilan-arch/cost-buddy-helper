/**
 * Klijentski ulaz u prepoznavanje potvrde o plaćanju i pravilo para
 * „račun + potvrda" unutar iste poruke. Implementacija je dijeljena s Edge
 * funkcijama — kod i worker se ne smiju razići (obrazac kao `docType.ts`).
 */
export {
  detectPaymentReceipt,
  parsePaidDateIso,
} from '../../../supabase/functions/_shared/mailImport/receiptSignals.ts';
export type { PaymentReceiptDetection } from '../../../supabase/functions/_shared/mailImport/receiptSignals.ts';
export { pairReceiptsWithInvoices } from '../../../supabase/functions/_shared/mailImport/receiptPairing.ts';
export type {
  ReceiptPairProbe,
  ReceiptPairing,
} from '../../../supabase/functions/_shared/mailImport/receiptPairing.ts';

export const PAYMENT_RECEIPT_DOC_TYPE = 'potvrda_placanja';
export const PAYMENT_RECEIPT_WARNING = 'potvrda_uz_racun';

export interface PairedReceiptItem {
  id: string;
  doc_type?: string | null;
  extraction?: Record<string, unknown> | null;
}

export interface PairedReceipt {
  id: string;
  receiptNumber: string | null;
  paidDate: string | null;
}

/**
 * Razdvaja red pregleda: potvrde plaćanja vezane uz račun KOJI JE u redu ne
 * dobivaju vlastitu karticu, nego se prikazuju uz taj račun. Potvrda čiji račun
 * nije u redu ostaje vidljiva (korisniku je možda jedini dokument).
 */
export function splitPairedReceipts<T extends PairedReceiptItem>(
  items: readonly T[],
): { visible: T[]; receiptsByInvoiceId: Map<string, PairedReceipt> } {
  const ids = new Set(items.map((i) => i.id));
  const receiptsByInvoiceId = new Map<string, PairedReceipt>();
  const hidden = new Set<string>();

  for (const item of items) {
    const ex = (item.extraction ?? {}) as Record<string, unknown>;
    const relatedId = String(ex.related_item_id ?? '').trim();
    const isReceipt =
      item.doc_type === PAYMENT_RECEIPT_DOC_TYPE || ex.is_payment_receipt === true;
    if (!isReceipt || relatedId === '' || !ids.has(relatedId)) continue;
    hidden.add(item.id);
    receiptsByInvoiceId.set(relatedId, {
      id: item.id,
      receiptNumber: (ex.receipt_number as string | null) ?? null,
      paidDate: (ex.paid_date as string | null) ?? null,
    });
  }

  return { visible: items.filter((i) => !hidden.has(i.id)), receiptsByInvoiceId };
}
