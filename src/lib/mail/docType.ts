/**
 * MAIL UVOZ — tip dokumenta (UBL `InvoiceTypeCode`) na potvrdi.
 *
 * ZAŠTO DEFAULT 380: dio PDF varijanti (npr. Telemach) uopće ne nosi čitljiv
 * tip dokumenta, pa ekstrakcija ostavlja prazno. Baza traži neprazan
 * `doc_type` (CHECK `incoming_invoices_doc_type_present`), pa je potvrda
 * padala na tvrdom pravilu i korisnik je ostajao blokiran.
 *
 * 380 = obični (komercijalni) račun i pokriva golemu većinu stvarnih slučajeva.
 * Default NIJE tiho tumačenje: tip je vidljivo polje u pregledu i korisnik ga
 * — koji ionako gleda svaku stavku prije potvrde — smije promijeniti.
 */

export const DEFAULT_DOC_TYPE = '380';

/** Popis iz pravila prihvaćanja (`src/lib/eracun/acceptance.ts`). */
export const KNOWN_DOC_TYPES = [
  '380',
  '82',
  '381',
  '384',
  '386',
  '394',
  '389',
  '393',
  '875',
  '876',
  '877',
] as const;

export type KnownDocType = (typeof KNOWN_DOC_TYPES)[number];

/**
 * Konačan tip za potvrdu: korisnikov izbor > tip sa stavke > 380.
 * Prazno / samo razmaci se tretira kao da tipa nema.
 */
export const resolveConfirmDocType = (
  itemDocType: string | null | undefined,
  userChoice?: string | null,
): string => {
  const chosen = (userChoice ?? '').trim();
  if (chosen !== '') return chosen;
  const fromItem = (itemDocType ?? '').trim();
  if (fromItem !== '') return fromItem;
  return DEFAULT_DOC_TYPE;
};

/** i18n ključ opisa tipa (`mailReview.docType.<code>`). */
export const docTypeLabelKey = (code: string): string => `mailReview.docType.${code}`;
