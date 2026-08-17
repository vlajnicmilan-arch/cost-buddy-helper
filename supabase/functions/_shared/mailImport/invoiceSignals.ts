/**
 * MAIL UVOZ — JASAN SIGNAL „OVO JE RAČUN".
 *
 * Kvar (kolovoz 2026): dokument s jednim slabim sidrom izvoda i doslovnim
 * naslovom „Račun …" dobio je JEDINO pitanje „je li ovo izvod?", a odgovor
 * „nije" ga je pojeo. Ovdje se deterministički prepoznaje suprotan dokaz:
 * naslov/tekst govori RAČUN, pa dokument ide u račun-put (AI klasifikacija),
 * a ne u izvod-pitanje.
 *
 * OGRADE:
 *  - Riječ „račun" sama po sebi NIJE dokaz: „broj računa" i „stanje računa"
 *    stoje na svakom izvodu. Traže se oblici koji izvod nema.
 *  - Doslovan izvod-rječnik (izvod, izvadak, promet po računu…) je VETO:
 *    ovaj signal nikad ne smije oteti dokument jakom izvod-putu.
 */

/** Oblici koje nosi račun, a ne izvod. */
const INVOICE_PATTERNS: readonly RegExp[] = [
  /\bra[cč]un\s*(?:br\.?|broj)\b/i,
  /\bdospije[cć]e\s+ra[cč]una\b/i,
  /\bobavijest\s+o\s+pla[cć]anju\b/i,
  /\bponuda\s*(?:br\.?|broj)\b/i,
  /\bfaktura\b/i,
  /\binvoice\s*(?:no\.?|number|#)\b/i,
  /\brechnung(?:snummer)?\b/i,
  /\biznos\s+za\s+(?:uplatu|pla[cć]anje)\b/i,
  /\bnalog\s+za\s+pla[cć]anje\b/i,
];

/** Naslov koji doslovno imenuje dokument računom. */
const SUBJECT_PATTERNS: readonly RegExp[] = [
  /\bra[cč]un\b/i,
  /\bfaktura\b/i,
  /\binvoice\b/i,
  /\brechnung\b/i,
];

/** Izvod-rječnik: ako je prisutan, ovaj signal šuti. */
const STATEMENT_VETO: readonly RegExp[] = [
  /\bizvod\b/i,
  /\bizvadak\b/i,
  /\bstatement\b/i,
  /\bkontoauszug\b/i,
  /\bpromet\s+po\s+ra[cč]unu\b/i,
];

const hasAny = (value: string, patterns: readonly RegExp[]): boolean =>
  patterns.some((re) => re.test(value));

/**
 * Jasan račun-signal u naslovu ili tekstu, bez ijedne izvod-riječi.
 * Naslov i tekst se gledaju ZAJEDNO za veto — proslijeđeni izvod ne smije
 * proći samo zato što naslov spominje „račun".
 */
export function carriesInvoiceSignal(
  rawText: string | null | undefined,
  subject?: string | null,
): boolean {
  const text = rawText ?? '';
  const subj = subject ?? '';
  const combined = `${subj}\n${text}`;
  if (hasAny(combined, STATEMENT_VETO)) return false;
  return hasAny(subj, SUBJECT_PATTERNS) || hasAny(text, INVOICE_PATTERNS);
}
