/**
 * PRAVILO „JE LI OVO ISTI TROŠAK" — ručni/slikani redak ↔ bankovni redak.
 * Jedan izvor istine za sinkronizaciju, uvoz izvoda i ručni unos.
 * ZRCALO: src/lib/sameExpenseRule.ts ↔ supabase/functions/_shared/sameExpenseRule.ts
 * (blok SHARED CORE mora biti doslovno isti; čuva ga sameExpenseRuleMirror.test.ts).
 */

// ---------------- SHARED CORE START ----------------
/* eslint-disable */
// Pure logic, no imports. Identical in src/lib and supabase/functions/_shared.

// ── Merchant similarity (moved verbatim from duplicateDetection / comparableName) ──

/**
 * Geo / country tokens commonly found in HR POS transaction descriptions.
 * Stripping them prevents false-positives where two unrelated merchants share
 * a city name (e.g. "LUKOIL POLJUD/SPLIT/HRV" vs "LESNINA H PC SPLIT").
 * MIRROR: same list as GEO_STOPWORDS in src/lib/importFingerprint.ts.
 */
const GEO_STOPWORDS = new Set([
  'split','zagreb','rijeka','osijek','zadar','pula','sibenik','dubrovnik',
  'varazdin','karlovac','vinkovci','sisak','slavonski','brod','bjelovar',
  'kastel','supetar','trogir','makarska','samobor','koprivnica','krapina',
  'cakovec','gospic','velika','gorica','hrv','hrvatska','hr','eur','eu',
]);

export function normalizeMerchant(name: string): string {
  if (!name) return '';
  const cleaned = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/\b(d\.?o\.?o\.?|d\.?d\.?|j\.?d\.?o\.?o\.?|obrt|trgovina|trgovački|poslovanje|hotel)\b/gi, '')
    .replace(/\b\d{2,}\b/g, ' ') // drop store numbers
    .replace(/[.,&\-_'"()/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const filtered = cleaned
    .split(/\s+/)
    .filter(w => !GEO_STOPWORDS.has(w))
    .join(' ')
    .trim();
  return filtered;
}

export function areMerchantsSimilar(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const na = normalizeMerchant(a);
  const nb = normalizeMerchant(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length < 2 || nb.length < 2) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = na.split(/\s+/).filter(w => w.length >= 3);
  const wb = nb.split(/\s+/).filter(w => w.length >= 3);
  if (wa.length === 0 || wb.length === 0) return false;
  const common = wa.filter(w => wb.some(w2 => w2.includes(w) || w.includes(w2)));
  const minLen = Math.min(wa.length, wb.length);
  // Require either ≥2 common meaningful words OR ≥60% overlap on a multi-word name.
  // Single shared word on multi-word merchants is too weak (typical false-positive).
  if (common.length >= 2) return true;
  return minLen >= 2 && common.length / minLen >= 0.6;
}

/**
 * VODEĆI BANKOVNI GLAGOLI — "Plaćanje", "Uplata", "POS kup." i sl. nisu dio
 * imena protustrane, nego opis radnje banke. Uklanjaju se SAMO s početka
 * imena. Vrijednosti su već normalizirane.
 */
const LEADING_BANK_VERBS: readonly (readonly string[])[] = [
  ['trajni', 'nalog'],
  ['pos', 'kup'],
  ['placanje'],
  ['uplata'],
  ['isplata'],
  ['prijenos'],
  ['naplata'],
  ['transakcija'],
  ['kup'],
  ['dc'],
  ['sepa'],
];

/** Uklanja vodeći glagolski prefiks; nikad ne vraća prazno (tada original). */
export function stripLeadingBankVerbs(normalized: string): string {
  if (!normalized) return normalized;
  let tokens = normalized.split(/\s+/).filter(Boolean);
  let changed = true;
  while (changed && tokens.length > 0) {
    changed = false;
    for (const verb of LEADING_BANK_VERBS) {
      if (tokens.length <= verb.length) continue;
      if (verb.every((w, i) => tokens[i] === w)) {
        tokens = tokens.slice(verb.length);
        changed = true;
        break;
      }
    }
  }
  const stripped = tokens.join(' ');
  return stripped || normalized;
}

// ── Same-expense rule ──

export const SAME_EXPENSE_AUTO_DAYS_BEFORE = 1;
export const SAME_EXPENSE_AUTO_DAYS_AFTER = 3;
export const SAME_EXPENSE_OFFER_MAX_DAYS = 4;

export type SameExpenseOrigin =
  | { readonly kind: 'sync'; readonly importedAt: string | null }
  | { readonly kind: 'statement'; readonly importedAt: string | null }
  | { readonly kind: 'manual' };

/** Normalizirani redak koji pravilo čita. Polja za prikaz se samo prosljeđuju. */
export interface SameExpenseRow {
  readonly id: string;
  /** `user_id` KAKAV PIŠE U BAZI. */
  readonly userId: string;
  readonly paymentSource: string | null;
  readonly type: string;
  readonly amount: number;
  /** Datum knjiženja / troška (ISO ili YYYY-MM-DD). */
  readonly date: string;
  readonly merchantName?: string | null;
  readonly description?: string | null;
  readonly cardId?: string | null;
  readonly cardLast4?: string | null;
  readonly expenseNature?: string | null;
  readonly isAdvance?: boolean | null;
  readonly linkedAdvanceIds?: readonly string[] | null;
  readonly deletedAt?: string | null;
  readonly bankTransactionId?: string | null;
  readonly bankMatchStatus?: string | null;
  readonly bankRawLine?: string | null;
  readonly origin?: SameExpenseOrigin;
}

/** cardId → payment_source_id (payment_source_cards). */
export type CardWalletMap = Readonly<Record<string, string>>;

export class SameExpenseOwnerError extends Error {
  constructor() {
    super('sameExpenseRule: userId is required');
    this.name = 'SameExpenseOwnerError';
  }
}

export type SameExpenseAutoOutcome = 'match' | 'ambiguous' | 'uncertain' | 'none';

export interface SameExpenseAutoResult<R extends SameExpenseRow = SameExpenseRow> {
  readonly outcome: SameExpenseAutoOutcome;
  /** Samo kod `match`. */
  readonly candidate: R | null;
  /** Kandidati koji su prošli sve uvjete (za dijagnostiku). */
  readonly passing: readonly R[];
  readonly reason: string;
}

export interface SameExpenseOffer<R extends SameExpenseRow = SameExpenseRow> {
  readonly row: R;
  readonly merchantSimilar: boolean;
  readonly dayDiff: number;
}

const UUID_RE_SE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOM_RE_SE = /^custom:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Isto kao `resolvePaymentSourceKey` (src/lib/paymentSource/resolve.ts). */
export function sameExpenseSourceKey(value: string | null | undefined): string {
  if (value == null) return '__unknown__';
  const trimmed = String(value).trim();
  if (trimmed === '') return '__unknown__';
  const m = CUSTOM_RE_SE.exec(trimmed);
  if (m) return `custom:${m[1].toLowerCase()}`;
  if (UUID_RE_SE.test(trimmed)) return `custom:${trimmed.toLowerCase()}`;
  return trimmed;
}

function dayNumber(d: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ''));
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000;
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return Number.NaN;
  const x = new Date(t);
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) / 86400000;
}

function centsOf(n: number): number {
  return Math.round(Math.abs(Number(n)) * 100);
}

function isPlainRow(r: SameExpenseRow): boolean {
  const t = r.type ?? 'expense';
  if (t !== 'expense' && t !== 'income') return false;
  if ((r.expenseNature ?? 'regular') === 'correction') return false;
  if (r.isAdvance) return false;
  if (Array.isArray(r.linkedAdvanceIds) && r.linkedAdvanceIds.length > 0) return false;
  if (r.deletedAt) return false;
  return true;
}

function significant(name: string): boolean {
  return name.split(/\s+/).some(w => w.length >= 3);
}

/** Ime ručnog retka: trgovac, a opis samo ako trgovca nema. */
function manualName(r: SameExpenseRow): string {
  const m = (r.merchantName ?? '').trim();
  return m || (r.description ?? '').trim();
}

/** Imena bankovnog retka: protustrana, pa opis (oba i sa skinutim glagolom). */
function bankNames(r: SameExpenseRow): string[] {
  const out: string[] = [];
  for (const raw of [r.merchantName, r.description]) {
    const v = (raw ?? '').trim();
    if (!v) continue;
    out.push(v);
    const stripped = stripLeadingBankVerbs(normalizeMerchant(v));
    if (stripped && stripped !== normalizeMerchant(v)) out.push(stripped);
  }
  return out;
}

type NameVerdict = 'similar' | 'different' | 'unknown';

export function sameExpenseMerchantVerdict(manual: SameExpenseRow, bank: SameExpenseRow): NameVerdict {
  const m = manualName(manual);
  const names = bankNames(bank);
  const mNorm = normalizeMerchant(m);
  const bankUsable = names.some(n => significant(normalizeMerchant(n)));
  if (!mNorm || !significant(mNorm) || !bankUsable) return 'unknown';
  return names.some(n => areMerchantsSimilar(m, n)) ? 'similar' : 'different';
}

type CardVerdict = 'ok' | 'other_wallet' | 'unknown';

/** Kartice ne blokiraju ako nedostaju, iste su, ili obje pripadaju novčaniku retka. */
export function sameExpenseCardVerdict(
  a: SameExpenseRow,
  b: SameExpenseRow,
  cardWallets: CardWalletMap,
): CardVerdict {
  const ca = a.cardId ?? null;
  const cb = b.cardId ?? null;
  if (!ca || !cb || ca === cb) return 'ok';
  const wallet = sameExpenseSourceKey(a.paymentSource);
  const wa = cardWallets[ca];
  const wb = cardWallets[cb];
  if (wa === undefined || wb === undefined) return 'unknown';
  if (sameExpenseSourceKey(wa) !== wallet || sameExpenseSourceKey(wb) !== wallet) return 'other_wallet';
  return 'ok';
}

/** Zajednički uvjeti obaju načina (bez datuma, trgovca i kartice). */
function basePasses(a: SameExpenseRow, b: SameExpenseRow): boolean {
  if (b.userId !== a.userId) return false;
  if (!isPlainRow(a) || !isPlainRow(b)) return false;
  if ((a.type ?? 'expense') !== (b.type ?? 'expense')) return false;
  if (sameExpenseSourceKey(a.paymentSource) !== sameExpenseSourceKey(b.paymentSource)) return false;
  const ca = centsOf(a.amount);
  if (!Number.isFinite(ca) || ca === 0 || ca !== centsOf(b.amount)) return false;
  return true;
}

/**
 * NAČIN `auto` — sinkronizacija i uvoz (nitko ne potvrđuje).
 * Za jedan bankovni redak traži ručni/slikani redak koji je ISTI trošak.
 * Spajanje je dopušteno samo kad je ishod `match`.
 */
export function decideSameExpenseAuto<R extends SameExpenseRow>(
  bank: SameExpenseRow,
  manuals: readonly R[],
  cardWallets: CardWalletMap = {},
): SameExpenseAutoResult<R> {
  if (!bank.userId) throw new SameExpenseOwnerError();
  const bankDay = dayNumber(bank.date);
  const passing: R[] = [];
  let uncertain = 0;
  for (const m of manuals) {
    if (!basePasses(bank, m)) continue;
    if (m.bankTransactionId && m.bankMatchStatus !== 'manual' && m.bankMatchStatus !== 'pending_bank') continue;
    const diff = bankDay - dayNumber(m.date);
    if (!(diff >= -SAME_EXPENSE_AUTO_DAYS_BEFORE && diff <= SAME_EXPENSE_AUTO_DAYS_AFTER)) continue;
    const card = sameExpenseCardVerdict(bank, m, cardWallets);
    if (card === 'other_wallet') continue;
    const name = sameExpenseMerchantVerdict(m, bank);
    if (name === 'different') continue;
    if (card === 'unknown' || name === 'unknown') { uncertain += 1; continue; }
    passing.push(m);
  }
  if (passing.length > 1) return { outcome: 'ambiguous', candidate: null, passing, reason: 'multiple_candidates' };
  if (passing.length === 1) {
    if (uncertain > 0) return { outcome: 'ambiguous', candidate: null, passing, reason: 'match_with_uncertain_rivals' };
    return { outcome: 'match', candidate: passing[0], passing, reason: 'single_candidate' };
  }
  if (uncertain > 0) return { outcome: 'uncertain', candidate: null, passing, reason: 'insufficient_evidence' };
  return { outcome: 'none', candidate: null, passing, reason: 'no_candidate' };
}

/**
 * `auto` za skup bankovnih redaka (jedno pokretanje sinkronizacije / jedan izvod).
 * Jedan-na-jedan: ako isti ručni redak traži ≥2 bankovna retka, svi ti retci
 * postaju `ambiguous` (npr. jedan račun cestarine ↔ dva prolaza istog iznosa).
 */
export function decideSameExpenseAutoBatch<R extends SameExpenseRow>(
  banks: readonly SameExpenseRow[],
  manuals: readonly R[],
  cardWallets: CardWalletMap = {},
): SameExpenseAutoResult<R>[] {
  const results = banks.map(b => decideSameExpenseAuto(b, manuals, cardWallets));
  const wanted = new Map<string, number>();
  for (const r of results) for (const c of r.passing) wanted.set(c.id, (wanted.get(c.id) ?? 0) + 1);
  return results.map(r => {
    if (r.outcome !== 'match' || !r.candidate) return r;
    if ((wanted.get(r.candidate.id) ?? 0) > 1) {
      return { outcome: 'ambiguous' as const, candidate: null, passing: r.passing, reason: 'candidate_wanted_by_multiple_bank_rows' };
    }
    return r;
  });
}

/**
 * NAČIN `offer` — ručni unos / slika računa (korisnik potvrđuje).
 * Vraća SVE bankovne kandidate, najprije slične po trgovcu, pa po blizini datuma.
 */
export function findSameExpenseOffers<R extends SameExpenseRow>(
  manual: SameExpenseRow,
  banks: readonly R[],
): SameExpenseOffer<R>[] {
  if (!manual.userId) throw new SameExpenseOwnerError();
  const manualDay = dayNumber(manual.date);
  const out: SameExpenseOffer<R>[] = [];
  for (const b of banks) {
    if (!b.bankTransactionId) continue;
    if (b.bankMatchStatus === 'confirmed') continue;
    if (!basePasses(manual, b)) continue;
    const diff = Math.abs(dayNumber(b.date) - manualDay);
    if (!(diff <= SAME_EXPENSE_OFFER_MAX_DAYS)) continue;
    out.push({ row: b, merchantSimilar: sameExpenseMerchantVerdict(manual, b) === 'similar', dayDiff: diff });
  }
  return out.sort((x, y) =>
    Number(y.merchantSimilar) - Number(x.merchantSimilar)
    || x.dayDiff - y.dayDiff
    || (x.row.id < y.row.id ? -1 : x.row.id > y.row.id ? 1 : 0));
}
// ---------------- SHARED CORE END ----------------
