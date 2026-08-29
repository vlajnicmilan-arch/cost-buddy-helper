/**
 * MAIL UVOZ — PAR „RAČUN + POTVRDA O PLAĆANJU" UNUTAR ISTE PORUKE.
 *
 * Pravilo se primjenjuje TEK NAKON što je svaka stavka klasificirana i ne dira
 * ni izvod-veto, ni `notInvoiceSignals`, ni zaštitu od duplikata privitka.
 *
 * Ako dvije stavke iste poruke nose ISTI broj računa, a jedna je po tekstu
 * dokumenta potvrda plaćanja (`receiptSignals.ts`) — potvrda se veže uz račun i
 * NE nudi se kao zaseban ulazni račun. Potvrda koja je stigla sama (bez računa u
 * istoj poruci) ostaje na pregledu kao i dosad.
 */

import { detectPaymentReceipt } from './receiptSignals.ts';

export interface ReceiptPairProbe {
  id: string;
  /** Tekst dokumenta (PDF tekstualni sloj, po potrebi + tijelo poruke). */
  text: string;
  /** Broj računa iz ekstrakcije, ako postoji. */
  invoiceNumber?: string | null;
}

export interface ReceiptPairing {
  receiptItemId: string;
  invoiceItemId: string;
  invoiceNumber: string;
  receiptNumber: string | null;
  paidDate: string | null;
}

const normalizeNumber = (value: string | null | undefined): string =>
  (value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** Parovi potvrda→račun unutar jedne poruke. Stavke bez broja se preskaču. */
export function pairReceiptsWithInvoices(
  probes: readonly ReceiptPairProbe[],
): ReceiptPairing[] {
  const groups = new Map<
    string,
    Array<{ probe: ReceiptPairProbe; receipt: ReturnType<typeof detectPaymentReceipt> }>
  >();

  for (const probe of probes) {
    const receipt = detectPaymentReceipt(probe.text);
    const number = normalizeNumber(receipt.invoiceNumber ?? probe.invoiceNumber ?? null);
    if (number === '') continue;
    groups.set(number, [...(groups.get(number) ?? []), { probe, receipt }]);
  }

  const out: ReceiptPairing[] = [];
  for (const [number, group] of groups) {
    if (group.length < 2) continue;
    const invoices = group.filter((g) => !g.receipt.matched);
    const receipts = group.filter((g) => g.receipt.matched);
    if (invoices.length === 0 || receipts.length === 0) continue;
    const invoice = invoices[0];
    for (const r of receipts) {
      out.push({
        receiptItemId: r.probe.id,
        invoiceItemId: invoice.probe.id,
        invoiceNumber: number,
        receiptNumber: r.receipt.receiptNumber,
        paidDate: r.receipt.paidDate,
      });
    }
  }
  return out;
}
