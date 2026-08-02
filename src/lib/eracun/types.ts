/**
 * eRačun (UBL 2.1) — tipovi.
 *
 * Čist modul bez React/Supabase ovisnosti. Namjerno opisuje CIJELI dokument
 * (i ono što kratka verzija UI-a još ne koristi), da ga veća verzija
 * — uvoz ulaznih računa s dospijećem — može preuzeti bez prepisivanja.
 */

/** UBL `InvoiceTypeCode` vrijednosti koje tretiramo kao poznate. */
export type EracunDocType =
  /** Obični račun */
  | '380'
  /** Odobrenje (credit note) — negativan iznos */
  | '381'
  /** Terećenje (debit note) */
  | '383'
  /** Račun za predujam */
  | '386'
  /** Samoizdani račun (self-billed) */
  | '389'
  /** Račun po najmu/leasingu i sl. periodični obračun */
  | '394'
  /** Sve ostalo — zadržavamo izvornu vrijednost u `docTypeRaw` */
  | 'other';

export interface EracunParty {
  name: string | null;
  /** OIB bez `HR` prefiksa kad je prepoznat. */
  oib: string | null;
  /** Izvorna vrijednost identifikatora (npr. `HR12345678901`). */
  taxIdRaw: string | null;
}

export interface EracunLine {
  /** Redni broj linije iz dokumenta (`cbc:ID`). */
  lineId: string | null;
  name: string;
  quantity: number;
  unitPrice: number | null;
  /** `cbc:LineExtensionAmount` — iznos linije bez PDV-a. */
  lineAmount: number;
  /** Stopa PDV-a na liniji, ako je navedena. */
  vatPercent: number | null;
}

export interface EracunTaxSubtotal {
  taxableAmount: number;
  taxAmount: number;
  percent: number | null;
  /** UBL kategorija poreza (`S`, `AE`, `E`, `Z`, `O`…). */
  categoryId: string | null;
}

/**
 * Upozorenja koja UI MORA prikazati korisniku.
 * Nikad ne tumačimo dokument tiho.
 */
export type EracunWarningCode =
  /** Tip dokumenta nije 380/394 — traži ljudsku odluku. */
  | 'unusual_doc_type'
  /** Odobrenje (381) — predlaže se negativan iznos. */
  | 'credit_note'
  /** Valuta nije EUR. */
  | 'foreign_currency'
  /** Zbroj linija se ne poklapa s ukupnim iznosom. */
  | 'total_mismatch'
  /** Ukupan iznos nije pronađen. */
  | 'missing_total'
  /** Datum izdavanja nije pronađen. */
  | 'missing_issue_date'
  /** Dobavljač nije pronađen. */
  | 'missing_supplier';

export interface EracunWarning {
  code: EracunWarningCode;
  /** Kontekst za i18n poruku (npr. `{ currency: 'USD' }`). */
  params?: Record<string, string | number>;
}

export interface EracunInvoice {
  /** Broj računa (`cbc:ID`). */
  invoiceNumber: string | null;
  docType: EracunDocType;
  /** Izvorni `InvoiceTypeCode`/`CreditNoteTypeCode`. */
  docTypeRaw: string | null;
  /** ISO datum (YYYY-MM-DD). */
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  supplier: EracunParty;
  customer: EracunParty;
  /** IBAN primatelja plaćanja, ako postoji. */
  iban: string | null;
  /** Poziv na broj / referenca plaćanja. */
  paymentReference: string | null;
  lines: EracunLine[];
  taxSubtotals: EracunTaxSubtotal[];
  /** Osnovica bez PDV-a. */
  taxExclusiveAmount: number | null;
  /** Ukupan PDV. */
  taxAmount: number | null;
  /** Iznos s PDV-om. */
  taxInclusiveAmount: number | null;
  /** Iznos za platiti — glavni iznos za trošak. */
  payableAmount: number | null;
  /**
   * Predloženi iznos troška: `payableAmount` (fallback `taxInclusiveAmount`),
   * negativan kod odobrenja (381).
   */
  suggestedAmount: number | null;
  /** Kod hrvatskog fiskaliziranog eRačuna (`hrext:HRFISK20Data`). */
  hrFiskPresent: boolean;
  warnings: EracunWarning[];
}

export class EracunParseError extends Error {
  /** i18n ključ pod `eracun.error.*`. */
  readonly code: 'not_xml' | 'not_ubl' | 'empty';
  constructor(code: 'not_xml' | 'not_ubl' | 'empty', message?: string) {
    super(message ?? code);
    this.name = 'EracunParseError';
    this.code = code;
  }
}
