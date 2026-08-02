/**
 * eRačun v1 — priprema serije (batch) za pregled prije spremanja.
 *
 * Čist modul (bez React/Supabase). Ulaz su već parsirani dokumenti, izlaz je
 * lista redaka za pregled: prihvaćen / odbijen / duplikat.
 *
 * Duplikat se prepoznaje po otisku sha256(OIB + broj računa):
 *  - `existing`  — otisak već postoji u `incoming_invoices`,
 *  - `batch`     — ista datoteka/dokument se pojavljuje dvaput u istoj seriji.
 *
 * `expenses` se ovdje NE dodiruje — ulazni računi žive u vlastitoj tablici.
 */

import type { EracunAcceptance } from './acceptance';
import type { EracunInvoice } from './types';

export type EracunDuplicateKind = 'existing' | 'batch';

export interface EracunParsedFile {
  readonly fileName: string;
  readonly invoice: EracunInvoice;
  readonly acceptance: EracunAcceptance;
  readonly fingerprint: string;
}

export interface EracunIntakeRow extends EracunParsedFile {
  readonly index: number;
  readonly duplicateOf: EracunDuplicateKind | null;
  /** Redak koji se sprema — prihvaćen i nije duplikat. */
  readonly importable: boolean;
}

export const buildIntakeRows = (
  files: readonly EracunParsedFile[],
  existingFingerprints: ReadonlySet<string>,
): EracunIntakeRow[] => {
  const seen = new Set<string>();

  return files.map((file, index) => {
    let duplicateOf: EracunDuplicateKind | null = null;
    if (existingFingerprints.has(file.fingerprint)) {
      duplicateOf = 'existing';
    } else if (seen.has(file.fingerprint)) {
      duplicateOf = 'batch';
    }
    if (file.acceptance.accepted) seen.add(file.fingerprint);

    return {
      ...file,
      index,
      duplicateOf,
      importable: file.acceptance.accepted && duplicateOf === null,
    };
  });
};

export interface EracunInsertRow {
  user_id: string;
  business_profile_id: string | null;
  supplier_name: string | null;
  supplier_oib: string;
  invoice_number: string;
  issue_date: string | null;
  due_date: string | null;
  total_amount: number;
  vat_amount: number | null;
  currency: string;
  iban: string | null;
  doc_type: string;
  items: unknown;
  fingerprint: string;
  import_batch_id: string;
  source_filename: string | null;
}

export const toInsertRow = (
  row: EracunIntakeRow,
  ctx: { userId: string; businessProfileId: string | null; batchId: string },
): EracunInsertRow => {
  const inv = row.invoice;
  return {
    user_id: ctx.userId,
    business_profile_id: ctx.businessProfileId,
    supplier_name: inv.supplier.name,
    supplier_oib: (inv.supplier.oib ?? '').trim(),
    invoice_number: (inv.invoiceNumber ?? '').trim(),
    issue_date: inv.issueDate,
    due_date: inv.dueDate,
    total_amount: row.acceptance.amount ?? 0,
    vat_amount: inv.taxAmount,
    currency: 'EUR',
    iban: inv.iban,
    doc_type: inv.docTypeRaw ?? inv.docType,
    items: inv.lines.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineAmount: l.lineAmount,
      vatPercent: l.vatPercent,
    })),
    fingerprint: row.fingerprint,
    import_batch_id: ctx.batchId,
    source_filename: row.fileName,
  };
};

export interface EracunIntakeSummary {
  readonly total: number;
  readonly importable: number;
  readonly duplicates: number;
  readonly rejected: number;
}

export const summarizeIntake = (rows: readonly EracunIntakeRow[]): EracunIntakeSummary => ({
  total: rows.length,
  importable: rows.filter((r) => r.importable).length,
  duplicates: rows.filter((r) => r.duplicateOf !== null).length,
  rejected: rows.filter((r) => !r.acceptance.accepted).length,
});
