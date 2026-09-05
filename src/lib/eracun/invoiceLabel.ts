/**
 * BROJ RAČUNA SMIJE NEDOSTAJATI.
 *
 * Aplikacijski računi i blagajnički isječci (Bolt, parking, automat) dolaze
 * bez broja dokumenta. Baza to od 5.9.2026. dopušta, pa svako mjesto koje broj
 * ISPISUJE mora imati jedan te isti zamjenski prikaz — nikad „null", nikad
 * prazan razmak.
 */

/** Prikaz broja dokumenta: prazan → „—". */
export const invoiceNumberLabel = (value?: string | null): string =>
  (value ?? '').trim() || '—';

/**
 * Kratki opis dokumenta za tekstove (opis troška, obavijest, dijalog).
 * Bez broja preuzima naziv druge strane; tek ako ni njega nema — „—".
 */
export const invoiceDescriptor = (invoice: {
  invoice_number?: string | null;
  supplier_name?: string | null;
  counterparty_name?: string | null;
}): string =>
  (invoice.invoice_number ?? '').trim() ||
  (invoice.supplier_name ?? '').trim() ||
  (invoice.counterparty_name ?? '').trim() ||
  '—';
