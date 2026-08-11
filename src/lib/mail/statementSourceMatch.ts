/**
 * MAIL UVOZ — odabir novčanika za bankovni izvod.
 *
 * Picker ne smije biti prazan kad aplikacija VEĆ zna odgovor. Slojevi po snazi
 * dokaza, prvi pogodak pobjeđuje i nosi vidljiv razlog:
 *
 *   1. `rule`         — zapamćeno pravilo (mail_statement_source_map)
 *   2. `bank_account` — mapiranje IBAN → izvor iz bank_accounts
 *   3. `bank_name`    — ime banke s izvoda ↔ ime novčanika ("Revolut Bank UAB"
 *                       pogađa novčanik "Revolut")
 *
 * Bez pogotka → pozivatelj nudi stvaranje novog novčanika s imenom banke.
 */

export type StatementSourceMatchReason = 'rule' | 'bank_account' | 'bank_name';

export interface MatchableSource {
  id: string;
  name: string;
}

export interface StatementSourceMatch {
  sourceId: string;
  reason: StatementSourceMatchReason;
}

/** Najkraći niz koji smije biti temelj podudaranja imena (izbjegava "AB", "N"). */
export const MIN_NAME_MATCH_CHARS = 4;

/** Riječi koje ne razlikuju banke — uklanjaju se prije usporedbe imena. */
const NAME_STOPWORDS = [
  'bank',
  'banka',
  'banke',
  'dd',
  'doo',
  'uab',
  'plc',
  'sa',
  'ag',
  'nv',
  'group',
  'pay',
];

/** Mala slova, bez dijakritike, bez interpunkcije i bez generičkih riječi. */
export function normalizeInstitutionName(value: string | null | undefined): string {
  const base = (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!base) return '';
  const kept = base
    .split(' ')
    // Jednoslovni ostaci pravnih oznaka ('d.d.' → 'd','d') nisu identitet banke.
    .filter((word) => word.length > 1 && !NAME_STOPWORDS.includes(word));
  return (kept.length > 0 ? kept : base.split(' ')).join('');
}

/**
 * Ime banke s izvoda ↔ ime novčanika, podudaranje u OBA smjera
 * ("Revolut Bank UAB" ↔ "Revolut"). Vraća prvi pogodak.
 */
export function matchSourceByBankName<T extends MatchableSource>(
  bankName: string | null | undefined,
  sources: readonly T[],
): T | null {
  const bank = normalizeInstitutionName(bankName);
  if (bank.length < MIN_NAME_MATCH_CHARS) return null;

  for (const source of sources) {
    const name = normalizeInstitutionName(source.name);
    if (name.length < MIN_NAME_MATCH_CHARS) continue;
    if (bank === name || bank.includes(name) || name.includes(bank)) return source;
  }
  return null;
}

export interface PickStatementSourceInput<T extends MatchableSource> {
  /** Izvor iz zapamćenog pravila (najjači dokaz). */
  ruleSourceId?: string | null;
  /** Izvor dobiven IBAN mapiranjem iz bank_accounts. */
  bankAccountSourceId?: string | null;
  bankName?: string | null;
  sources: readonly T[];
}

/** Vraća predodabrani izvor i razlog, ili `null` kad ništa ne pogađa. */
export function pickStatementSource<T extends MatchableSource>({
  ruleSourceId,
  bankAccountSourceId,
  bankName,
  sources,
}: PickStatementSourceInput<T>): StatementSourceMatch | null {
  const exists = (id: string | null | undefined) =>
    !!id && sources.some((s) => s.id === id);

  if (exists(ruleSourceId)) return { sourceId: ruleSourceId as string, reason: 'rule' };
  if (exists(bankAccountSourceId)) {
    return { sourceId: bankAccountSourceId as string, reason: 'bank_account' };
  }
  const byName = matchSourceByBankName(bankName, sources);
  return byName ? { sourceId: byName.id, reason: 'bank_name' } : null;
}
