/**
 * Mapiranje parsiranog eRačuna u polja postojećeg obrasca za trošak.
 *
 * Čist modul (bez React-a) — namjerno odvojen od parsera i od komponente,
 * da veća verzija uvoza može koristiti isti mapping.
 */

import type { ReceiptItem } from '@/types/expense';
import type { EracunInvoice } from './types';

export interface EracunExpenseDraft {
  /** Dobavljač → trgovac. */
  merchantName: string;
  /** Iznos kao string za `MoneyInput` (negativan kod odobrenja ostaje s minusom). */
  amount: string;
  /** Predloženi datum = datum izdavanja; korisnik ga smije promijeniti. */
  date: string;
  description: string;
  /** Broj računa, OIB, IBAN, dospijeće — u napomenu jer nemaju vlastita polja. */
  note: string;
  items: ReceiptItem[];
}

/** Stavke se prenose samo ako imaju ime i iznos — inače nemaju vrijednost u `receipt_items`. */
export const toReceiptItems = (invoice: EracunInvoice): ReceiptItem[] =>
  invoice.lines
    .filter((line) => line.name.trim().length > 0 && Number.isFinite(line.lineAmount))
    .map((line) => ({
      name: line.name.trim(),
      quantity: line.quantity,
      unit_price: line.unitPrice ?? undefined,
      total_price: Math.round(line.lineAmount * 100) / 100,
    }));

const formatAmount = (value: number | null): string =>
  value === null ? '' : (Math.round(value * 100) / 100).toFixed(2);

export const buildEracunNote = (invoice: EracunInvoice): string => {
  const parts: string[] = [];
  if (invoice.invoiceNumber) parts.push(`Račun: ${invoice.invoiceNumber}`);
  if (invoice.supplier.oib) parts.push(`OIB: ${invoice.supplier.oib}`);
  else if (invoice.supplier.taxIdRaw) parts.push(`OIB: ${invoice.supplier.taxIdRaw}`);
  if (invoice.dueDate) parts.push(`Dospijeće: ${invoice.dueDate}`);
  if (invoice.iban) parts.push(`IBAN: ${invoice.iban}`);
  if (invoice.currency !== 'EUR') parts.push(`Valuta: ${invoice.currency}`);
  if (invoice.docTypeRaw) parts.push(`Tip: ${invoice.docTypeRaw}`);
  return parts.join(' • ');
};

export const toExpenseDraft = (invoice: EracunInvoice, today: string): EracunExpenseDraft => {
  const supplier = invoice.supplier.name?.trim() ?? '';
  const description = invoice.invoiceNumber
    ? `${supplier || 'eRačun'} — ${invoice.invoiceNumber}`
    : supplier || 'eRačun';

  return {
    merchantName: supplier,
    amount: formatAmount(invoice.suggestedAmount),
    date: invoice.issueDate ?? today,
    description,
    note: buildEracunNote(invoice),
    items: toReceiptItems(invoice),
  };
};
