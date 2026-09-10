/**
 * MAIL UVOZ — RAČUN U VALUTI KOJA NIJE EUR.
 *
 * `incoming_invoices` ima CHECK `incoming_invoices_currency_eur`: ulazni računi
 * postoje SAMO u eurima. Prije ovog pravila potvrda takvog računa padala je na
 * bazi (23514) uz generičku poruku, a korisnik nije imao izlaz.
 *
 * Odluka: ne zovemo RPC koji sigurno pada. Kartica kaže razlog i nudi izlaz —
 * spremanje kao OBIČAN TROŠAK, u izvornoj valuti i bez ikakvog preračuna.
 */

export const SUPPORTED_INVOICE_CURRENCY = 'EUR';

/** Valuta računa kad NIJE EUR (npr. „GBP"); inače `null`. */
export const foreignInvoiceCurrency = (
  extraction: Record<string, unknown> | null | undefined,
): string | null => {
  const raw = String((extraction ?? {}).currency ?? '').trim().toUpperCase();
  if (raw === '') return null;
  return raw === SUPPORTED_INVOICE_CURRENCY ? null : raw;
};

/** Opis troška: dobavljač + broj računa, bez praznih spojnica. */
export const foreignExpenseDescription = (
  extraction: Record<string, unknown> | null | undefined,
  fallback: string,
): string => {
  const source = extraction ?? {};
  const parts = [source.supplier_name, source.invoice_number]
    .map((p) => String(p ?? '').trim())
    .filter((p) => p !== '');
  return parts.length > 0 ? parts.join(' · ') : fallback;
};

/** Iznos troška: pozitivan broj ili `null` kad ga nema. */
export const foreignExpenseAmount = (
  extraction: Record<string, unknown> | null | undefined,
): number | null => {
  const raw = (extraction ?? {}).total_amount;
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.abs(n);
};
