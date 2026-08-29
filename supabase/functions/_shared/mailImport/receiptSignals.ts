/**
 * MAIL UVOZ — POTVRDA O PLAĆANJU NIJE DRUGI RAČUN.
 *
 * Kvar iz života (29.8.2026): Stripe/Lovable je u jednoj poruci poslao dva PDF-a
 * za JEDNO plaćanje — „Invoice DFWF2F5F0094" i „Receipt 202167961639" za taj isti
 * račun. Bajtovi su različiti, sadržaj je različit, pa zaštita od duplikata
 * privitka ispravno šuti. Rezultat: dva ulazna računa za jedno plaćanje.
 *
 * Ovdje se potvrda prepoznaje IZ TEKSTA DOKUMENTA i to samo po KOMBINACIJI
 * signala. Riječ „receipt" u predmetu maila ili u nazivu datoteke NIJE dokaz —
 * predmet spornog maila glasi „Your receipt…", a prvi privitak je ipak račun.
 */

export interface PaymentReceiptDetection {
  matched: boolean;
  /** Broj računa na koji se potvrda odnosi. */
  invoiceNumber: string | null;
  /** Broj same potvrde. */
  receiptNumber: string | null;
  /** Doslovan tekst datuma plaćanja s dokumenta („August 29, 2026"). */
  paidDate: string | null;
}

/** Naslovni redak dokumenta — samostalna riječ, ne dio rečenice. */
const TITLE_LINE =
  /^(receipt|payment\s+receipt|potvrda(?:\s+o\s+pla[ćc]anju)?|potvrda\s+uplate|zahlungsbeleg|quittung)\b[\s:.-]*$/i;

/** Naslov se traži samo u glavi dokumenta — potvrda se predstavlja odmah. */
const HEAD_LINES = 12;

const RECEIPT_NUMBER_LABEL =
  /(?:receipt\s*(?:number|no\.?|#)|broj\s+potvrde|belegnummer)\s*[:#]?\s*/i;
const INVOICE_NUMBER_LABEL =
  /(?:invoice\s*(?:number|no\.?|#)|broj\s+ra[čc]una|rechnungsnummer)\s*[:#]?\s*/i;
const PAID_DATE_LABEL =
  /(?:date\s+paid|paid\s+on|datum\s+pla[ćc]anja|datum\s+uplate|bezahlt\s+am|zahlungsdatum)\s*[:#]?\s*/i;

const VALUE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._/#-]*/;
/** Datum je slobodan tekst — uzima se ostatak retka. */
const DATE_VALUE = /^[^\n]{1,60}/;

const lines = (text: string): string[] =>
  text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');

/** Vrijednost neposredno iza oznake; ako je redak prazan, gleda se sljedeći. */
const valueAfter = (text: string, label: RegExp, value: RegExp): string | null => {
  const m = label.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const sameLine = rest.split(/\r?\n/)[0] ?? '';
  const direct = value.exec(sameLine.trim());
  if (direct && direct[0].trim() !== '') return direct[0].trim();
  const next = rest.split(/\r?\n/).slice(1).find((l) => l.trim() !== '') ?? '';
  const fromNext = value.exec(next.trim());
  return fromNext && fromNext[0].trim() !== '' ? fromNext[0].trim() : null;
};

/**
 * Potvrda o plaćanju = naslov dokumenta „Receipt/Potvrda…" I barem još jedan
 * potvrdni podatak (broj potvrde ili datum plaćanja). Jedan signal sam nikad
 * nije dovoljan.
 */
export function detectPaymentReceipt(
  rawText: string | null | undefined,
): PaymentReceiptDetection {
  const text = rawText ?? '';
  const empty: PaymentReceiptDetection = {
    matched: false,
    invoiceNumber: null,
    receiptNumber: null,
    paidDate: null,
  };
  if (text.trim() === '') return empty;

  const hasTitle = lines(text).slice(0, HEAD_LINES).some((l) => TITLE_LINE.test(l));
  const receiptNumber = valueAfter(text, RECEIPT_NUMBER_LABEL, VALUE_TOKEN);
  const paidDate = valueAfter(text, PAID_DATE_LABEL, DATE_VALUE);
  const invoiceNumber = valueAfter(text, INVOICE_NUMBER_LABEL, VALUE_TOKEN);

  const matched = hasTitle && (receiptNumber !== null || paidDate !== null);
  if (!matched) return { ...empty, invoiceNumber };
  return { matched: true, invoiceNumber, receiptNumber, paidDate };
}

/**
 * Datum plaćanja s potvrde u ISO obliku. Potvrde stižu na više jezika pa se
 * podržava i „29.08.2026." i „August 29, 2026". Neprepoznat oblik vraća null —
 * radije bez datuma nego s pogrešnim.
 */
export function parsePaidDateIso(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (value === '') return null;

  const dotted = /(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})/.exec(value);
  if (dotted) {
    const [, d, m, y] = dotted;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return iso[0];

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}
