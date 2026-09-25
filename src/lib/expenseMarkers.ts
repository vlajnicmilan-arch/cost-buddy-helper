/**
 * Oznake („Nepotrebno", „Luksuz") i vrste zapisa (pozajmice, uplata u firmu)
 * za osobne troškove/prihode. Čisti pomoćnici — bez React-a i bez baze.
 *
 * - `tags` i `movement_kind` NIKAD ne mijenjaju `type`, iznos ni izvor.
 * - Zbrajanje potrošnje uvijek ide kroz `isRealSpend` (redak s movement_kind
 *   nije potrošnja).
 * - Prijenos na vlastiti račun i bankomat ostaju postojeći tok prijenosa
 *   (type='transfer'); ovdje se ne nude.
 */
import { isRealSpend } from './spendClassification';

export const EXPENSE_TAGS = ['unnecessary', 'luxury'] as const;
export type ExpenseTag = (typeof EXPENSE_TAGS)[number];

export const ALL_MOVEMENT_KINDS = [
  'own_transfer',
  'atm',
  'loan_given',
  'loan_repaid_to_me',
  'loan_received',
  'loan_repaid_by_me',
  'own_company_payment',
] as const;
export type MovementKind = (typeof ALL_MOVEMENT_KINDS)[number];

/** Vrste koje korisnik smije odabrati pri upisu — ovisno o smjeru novca. */
const ENTRY_KINDS_BY_TYPE: Record<'expense' | 'income', readonly MovementKind[]> = {
  expense: ['loan_given', 'loan_repaid_by_me', 'own_company_payment'],
  income: ['loan_repaid_to_me', 'loan_received'],
};

export const LOAN_KINDS: readonly MovementKind[] = [
  'loan_given',
  'loan_repaid_to_me',
  'loan_received',
  'loan_repaid_by_me',
];

export function movementKindsForType(type: string | null | undefined): readonly MovementKind[] {
  if (type === 'expense' || type === 'income') return ENTRY_KINDS_BY_TYPE[type];
  return [];
}

export function isExpenseTag(v: unknown): v is ExpenseTag {
  return typeof v === 'string' && (EXPENSE_TAGS as readonly string[]).includes(v);
}

export function isMovementKind(v: unknown): v is MovementKind {
  return typeof v === 'string' && (ALL_MOVEMENT_KINDS as readonly string[]).includes(v);
}

/** Samo dopuštene oznake, bez duplikata, stabilnim redoslijedom. */
export function sanitizeTags(raw: readonly unknown[] | null | undefined): ExpenseTag[] {
  if (!Array.isArray(raw)) return [];
  return EXPENSE_TAGS.filter((tag) => raw.includes(tag));
}

export function toggleTag(tags: readonly ExpenseTag[], tag: ExpenseTag): ExpenseTag[] {
  return tags.includes(tag) ? sanitizeTags(tags.filter((x) => x !== tag)) : sanitizeTags([...tags, tag]);
}

export interface MarkerFields {
  tags?: ExpenseTag[];
  movement_kind?: MovementKind | null;
}

/**
 * Polja za NOVI zapis. `enabled=false` (poslovni/projektni) → ništa se ne šalje.
 * Prijenos ne nosi ni oznake ni vrstu. Oznake samo za trošak.
 */
export function buildMarkerFieldsForInsert(input: {
  enabled: boolean;
  type: string;
  tags: readonly ExpenseTag[];
  movementKind: MovementKind | null;
}): MarkerFields {
  if (!input.enabled || input.type === 'transfer') return {};
  const kind = input.movementKind && movementKindsForType(input.type).includes(input.movementKind)
    ? input.movementKind
    : null;
  return {
    tags: input.type === 'expense' ? sanitizeTags(input.tags) : [],
    movement_kind: kind,
  };
}

/**
 * Polja za UREĐIVANJE. Vrijednost koju korisnik nije dirao ostaje doslovno
 * (npr. own_transfer postavljen kroz Pregled kategorija). Nova vrijednost mora
 * odgovarati smjeru, inače se briše.
 */
export function buildMarkerFieldsForEdit(input: {
  enabled: boolean;
  type: string;
  tags: readonly ExpenseTag[];
  movementKind: MovementKind | null;
  originalMovementKind: string | null | undefined;
}): MarkerFields {
  if (!input.enabled || input.type === 'transfer') return {};
  const original = input.originalMovementKind ?? null;
  let kind: MovementKind | null;
  if (input.movementKind === original) {
    kind = isMovementKind(original) ? original : null;
    if (original !== null && kind === null) return { tags: sanitizeTags(input.tags) };
  } else {
    kind = input.movementKind && movementKindsForType(input.type).includes(input.movementKind)
      ? input.movementKind
      : null;
  }
  return { tags: sanitizeTags(input.tags), movement_kind: kind };
}

export interface MarkerRow {
  type?: string | null;
  amount: number | string;
  date: Date | string;
  tags?: readonly string[] | null;
  movement_kind?: string | null;
  expense_nature?: string | null;
  deleted_at?: string | null;
  project_id?: string | null;
  business_profile_id?: string | null;
  merchant_name?: string | null;
  description?: string | null;
}

const isPersonalRow = (r: MarkerRow) => !r.project_id && !r.business_profile_id;

export function monthRange(ref: Date): { start: Date; end: Date } {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

/** Zbroj stvarne osobne potrošnje s oznakom u razdoblju (preko svih kategorija). */
export function sumTaggedSpend(
  rows: readonly MarkerRow[],
  tag: ExpenseTag,
  range: { start: Date; end: Date },
): { total: number; count: number } {
  let total = 0;
  let count = 0;
  for (const r of rows) {
    if (!isPersonalRow(r) || !isRealSpend(r)) continue;
    if (!Array.isArray(r.tags) || !r.tags.includes(tag)) continue;
    const d = r.date instanceof Date ? r.date : new Date(r.date);
    if (d < range.start || d > range.end) continue;
    total += Number(r.amount) || 0;
    count += 1;
  }
  return { total: Math.round(total * 100) / 100, count };
}

/**
 * Ključ osobe: isto ime pisano različito (velika/mala slova, dijakritici,
 * razmaci, interpunkcija) daje isti ključ. Različita imena („Marko" i
 * „Marko Horvat") se NE spajaju.
 */
export function personKey(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Osoba na zapisu: protustrana (merchant_name), inače opis. */
export function loanPersonName(r: Pick<MarkerRow, 'merchant_name' | 'description'>): string {
  return (r.merchant_name ?? '').trim() || (r.description ?? '').trim();
}

export interface LoanPersonSummary {
  key: string;
  name: string;
  /** Ja sam posudio. */
  given: number;
  /** Meni vraćeno. */
  repaidToMe: number;
  /** Duguju meni: given − repaidToMe. */
  owedToMe: number;
  /** Ja sam posudio od nekoga. */
  received: number;
  /** Ja vratio. */
  repaidByMe: number;
  /** Ja dugujem: received − repaidByMe. */
  iOwe: number;
  count: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildLoanSummary(rows: readonly MarkerRow[]): LoanPersonSummary[] {
  const map = new Map<string, LoanPersonSummary & { spellings: Map<string, number> }>();
  for (const r of rows) {
    if (r.deleted_at != null || !isPersonalRow(r)) continue;
    const kind = r.movement_kind;
    if (!kind || !LOAN_KINDS.includes(kind as MovementKind)) continue;
    const raw = loanPersonName(r);
    const key = personKey(raw);
    let entry = map.get(key);
    if (!entry) {
      entry = {
        key, name: raw, given: 0, repaidToMe: 0, owedToMe: 0,
        received: 0, repaidByMe: 0, iOwe: 0, count: 0, spellings: new Map(),
      };
      map.set(key, entry);
    }
    if (raw) entry.spellings.set(raw, (entry.spellings.get(raw) ?? 0) + 1);
    const amt = Number(r.amount) || 0;
    if (kind === 'loan_given') entry.given += amt;
    else if (kind === 'loan_repaid_to_me') entry.repaidToMe += amt;
    else if (kind === 'loan_received') entry.received += amt;
    else if (kind === 'loan_repaid_by_me') entry.repaidByMe += amt;
    entry.count += 1;
  }
  return [...map.values()]
    .map(({ spellings, ...e }) => {
      let best = e.name;
      let bestN = -1;
      for (const [s, n] of spellings) if (n > bestN) { best = s; bestN = n; }
      return {
        ...e,
        name: best,
        given: round2(e.given),
        repaidToMe: round2(e.repaidToMe),
        received: round2(e.received),
        repaidByMe: round2(e.repaidByMe),
        owedToMe: round2(e.given - e.repaidToMe),
        iOwe: round2(e.received - e.repaidByMe),
      };
    })
    .sort((a, b) => Math.abs(b.owedToMe) + Math.abs(b.iOwe) - (Math.abs(a.owedToMe) + Math.abs(a.iOwe)));
}
