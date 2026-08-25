/**
 * MAIL UVOZ — RAČUN NADJAČAVA IZVOD KAD IZVOD NEMA IDENTITET.
 *
 * Kvar iz života (kolovoz 2026): HEP-ov račun za plin dobio je tvrdu oznaku
 * `izvod` jer je nosio dva „jaka" signala izvoda (redci sa saldom, riječ
 * „stanje"). Pritom nije imao NIJEDAN identitet izvoda: nema imena banke, nema
 * broja izvoda, nema završnog stanja. Pravilo `racun_signal_jaci_od_izvoda`
 * postojalo je samo za MEKU sumnju (`needsHumanChoice`), pa tvrdu granu nije
 * ni dodirnulo.
 *
 * OVDJE se zatvara ta rupa: izvod BEZ identiteta koji nosi barem dvije oznake
 * računa nije izvod. Doslovan izvod-rječnik ostaje veto — pravi izvod se nikad
 * ne smije oteti.
 */

/** Oznake koje nosi račun. Broje se, ne zbrajaju se duplikati istog pravila. */
const INVOICE_MARKS: readonly RegExp[] = [
  // Doslovna riječ „račun/faktura/invoice/Rechnung" kao naziv dokumenta.
  /\bra[cč]un\s+(?:za|br\.?|broj)\b/i,
  /\bfaktura\b/i,
  /\binvoice\b/i,
  /\brechnung\b/i,
  // Broj dokumenta uz sidro.
  /\bbroj\s+[0-9][\w./-]{3,}/i,
  /\bra[cč]un\s*(?:br\.?|broj)\b/i,
  // Dospijeće / rok plaćanja (svi hrvatski padeži).
  /\bdospije[cčć]\w*\s+ra[cč]un\w*\b/i,
  /\bdatum\s+dospije[cčć]\w*/i,
  /\brok\s+pla[cć]anja\b/i,
  /\bdue\s+date\b/i,
  // Poziv na plaćanje.
  /\biznos\s+za\s+(?:uplatu|pla[cć]anje)\b/i,
  /\bnalog\s+za\s+pla[cć]anje\b/i,
  /\bra[cč]una?\s+s\s+pdv-?om\b/i,
];

/** Doslovan izvod-rječnik: ako postoji, nadjačavanje NIKAD ne radi. */
const STATEMENT_VETO: readonly RegExp[] = [
  /\bizvod\b/i,
  /\bizvadak\b/i,
  /\bstatement\b/i,
  /\bkontoauszug\b/i,
  /\bpromet\s+po\s+ra[cč]unu\b/i,
];

export interface StatementIdentity {
  bank_name?: string | null;
  statement_number?: string | null;
  closing_balance?: number | null;
}

/** Izvod bez ijednog vlastitog identiteta — nema banke, broja ni stanja. */
export const lacksStatementIdentity = (extraction: StatementIdentity): boolean =>
  !(extraction.bank_name ?? '').toString().trim() &&
  !(extraction.statement_number ?? '').toString().trim() &&
  (extraction.closing_balance === null || extraction.closing_balance === undefined);

export interface InvoiceOverrideInput {
  text: string;
  subject?: string | null;
  /** Ekstrakcija izvoda (bank_name / statement_number / closing_balance). */
  statementExtraction: StatementIdentity;
  /** OIB-i korisnikovih poslovnih profila — kupac na dokumentu je jak dokaz. */
  ownOibs?: readonly string[];
  /** Korisnikova ranija odluka; `izvod` gasi nadjačavanje. */
  userClassification?: 'racun' | 'izvod' | null;
}

/** Najmanje dvije oznake računa — jedna sama je preslaba. */
const MIN_MARKS = 2;

export function invoiceOverridesStatement(input: InvoiceOverrideInput): boolean {
  if (input.userClassification === 'izvod') return false;
  if (!lacksStatementIdentity(input.statementExtraction)) return false;

  const combined = `${input.subject ?? ''}\n${input.text ?? ''}`;
  if (STATEMENT_VETO.some((re) => re.test(combined))) return false;

  let marks = INVOICE_MARKS.filter((re) => re.test(combined)).length;

  // OIB kupca koji odgovara korisnikovom profilu: dokument je ispostavljen NAMA.
  const digits = combined.replace(/[^0-9]/g, '');
  if ((input.ownOibs ?? []).some((oib) => oib.length === 11 && digits.includes(oib))) {
    marks += 1;
  }

  return marks >= MIN_MARKS;
}
