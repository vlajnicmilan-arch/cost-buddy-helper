/**
 * MAIL UVOZ — MEKA DEDUP NAJAVA.
 *
 * Prije potvrde samo NAJAVLJUJEMO da račun vjerojatno već postoji. Ništa se ne
 * odbacuje, status se ne mijenja — odluka ostaje na korisniku.
 *
 * Uvjet (prošireno, kolovoz 2026 — FINA slučaj „I08-0626-390029" vs
 * „08-0626-390029"): isti OIB + normalizirano isti broj, ILI isti OIB + isti
 * iznos + isto dospijeće/datum izdavanja. Usporedba živi u
 * `invoiceNumberMatch.ts` i dijele je poslužitelj i preglednik.
 */

import { findDuplicateCandidate } from "./invoiceNumberMatch.ts";

export const PROBABLE_DUPLICATE_WARNING = 'vjerojatno_duplikat';

// deno-lint-ignore no-explicit-any
export type SoftDupClient = { from: (table: string) => any };

export interface SoftDupParams {
  supplierOib: string | null | undefined;
  invoiceNumber: string | null | undefined;
  docType: string | null | undefined;
  direction?: string;
  totalAmount?: number | string | null;
  dueDate?: string | null;
  issueDate?: string | null;
  scopeType: 'user' | 'business_profile';
  /** Vlasnik (za osobni scope) ili id biznis profila. */
  scopeId: string;
  ownerUserId: string;
}

export async function findProbableDuplicate(
  client: SoftDupClient,
  p: SoftDupParams,
): Promise<boolean> {
  const oib = (p.supplierOib ?? '').toString().trim();
  if (!oib) return false;

  // Isti default kao na potvrdi (mail_item_confirm / docType.ts): prazan tip
  // je 380, inače bi najava i potvrda gledale različite ključeve.
  const docType = (p.docType ?? '').toString().trim() || '380';

  let query = client
    .from('incoming_invoices')
    .select('id, supplier_oib, supplier_name, invoice_number, total_amount, due_date, issue_date, doc_type')
    .eq('direction', p.direction ?? 'in')
    .eq('supplier_oib', oib);

  query = p.scopeType === 'business_profile'
    ? query.eq('business_profile_id', p.scopeId)
    : query.is('business_profile_id', null).eq('user_id', p.ownerUserId);

  const { data, error } = await query.limit(200);
  if (error) {
    console.warn('[softDuplicate] provjera nije uspjela:', error.message);
    return false;
  }
  const match = findDuplicateCandidate((data ?? []) as Record<string, unknown>[], {
    supplierOib: oib,
    invoiceNumber: p.invoiceNumber,
    totalAmount: p.totalAmount,
    dueDate: p.dueDate,
    issueDate: p.issueDate,
    docType,
  });
  return match !== null;
}
