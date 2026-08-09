/**
 * MAIL UVOZ — MEKA DEDUP NAJAVA.
 *
 * Prije potvrde samo NAJAVLJUJEMO da račun vjerojatno već postoji. Ništa se ne
 * odbacuje, status se ne mijenja — odluka ostaje na korisniku (isti ključ koji
 * koristi `mail_item_confirm`: direction + supplier_oib + invoice_number +
 * doc_type, unutar particije scopea).
 */

export const PROBABLE_DUPLICATE_WARNING = 'vjerojatno_duplikat';

// deno-lint-ignore no-explicit-any
export type SoftDupClient = { from: (table: string) => any };

export interface SoftDupParams {
  supplierOib: string | null | undefined;
  invoiceNumber: string | null | undefined;
  docType: string | null | undefined;
  direction?: string;
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
  const number = (p.invoiceNumber ?? '').toString().trim();
  if (!oib || !number) return false;

  let query = client
    .from('incoming_invoices')
    .select('id')
    .eq('direction', p.direction ?? 'in')
    .eq('supplier_oib', oib)
    .eq('invoice_number', number)
    // Isti default kao na potvrdi (mail_item_confirm / docType.ts): prazan tip
    // je 380, inače bi najava i potvrda gledale različite ključeve.
    .eq('doc_type', (p.docType ?? '').toString().trim() || '380');

  query = p.scopeType === 'business_profile'
    ? query.eq('business_profile_id', p.scopeId)
    : query.is('business_profile_id', null).eq('user_id', p.ownerUserId);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) {
    console.warn('[softDuplicate] provjera nije uspjela:', error.message);
    return false;
  }
  return Boolean(data);
}
