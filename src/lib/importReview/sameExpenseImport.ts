/**
 * UVOZ IZVODA × PRAVILO „ISTI TROŠAK" (nalog 3).
 *
 * Tanki prilagodnik između redaka uvoza (PDF/slika/mail i CSV) i pravila
 * `sameExpenseRule` u načinu `auto`. Jedan izvod = jedan batch
 * (`decideSameExpenseAutoBatch`, jedan-na-jedan). Prijenosi nikad ne ulaze.
 *
 * Čisti modul — bez Reacta i Supabasea.
 */

import {
  decideSameExpenseAuto,
  decideSameExpenseAutoBatch,
  sameExpenseMerchantVerdict,
  type CardWalletMap,
  type SameExpenseAutoResult,
  type SameExpenseRow,
} from '@/lib/sameExpenseRule';

export interface ImportRuleBankRow {
  readonly index: number;
  readonly paymentSource: string | null | undefined;
  readonly type: string;
  readonly amount: number;
  readonly date: Date | string;
  readonly merchantName?: string | null;
  readonly description?: string | null;
  readonly cardId?: string | null;
}

export interface ImportRuleManualRow {
  readonly id: string;
  /** `user_id` KAKAV PIŠE U BAZI. Bez njega kandidat nikad ne prolazi. */
  readonly userId?: string | null;
  readonly paymentSource: string | null | undefined;
  readonly type: string;
  readonly amount: number;
  readonly date: Date | string;
  readonly merchantName?: string | null;
  readonly description?: string | null;
  readonly cardId?: string | null;
  readonly expenseNature?: string | null;
  readonly isAdvance?: boolean | null;
  readonly linkedAdvanceIds?: readonly string[] | null;
  readonly deletedAt?: string | null;
  readonly bankTransactionId?: string | null;
  readonly bankMatchStatus?: string | null;
}

export interface ImportRuleContext {
  /** Vlasnik uvoza (prijavljeni korisnik). */
  readonly userId: string;
  readonly cardWallets: CardWalletMap;
}

export interface ImportRuleDecision {
  readonly importedIndex: number;
  readonly outcome: SameExpenseAutoResult['outcome'];
  readonly reason: string;
  /** Samo kod `match`. */
  readonly manualId: string | null;
  /** Kandidati za pitanje na pregledu (`ambiguous` / `uncertain`). */
  readonly candidateIds: string[];
  /** Kod `uncertain`: je li razlog nepoznato ime (inače nepoznata kartica). */
  readonly nameUnknown: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Lokalni kalendarski dan (isti kao `toDayStart` u klasifikatoru). */
export function toRuleDay(d: Date | string): string {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function isRuleType(t: string): boolean {
  return t === 'expense' || t === 'income';
}

function bankToRule(row: ImportRuleBankRow, userId: string): SameExpenseRow {
  return {
    id: `imp:${row.index}`,
    userId,
    paymentSource: row.paymentSource ?? null,
    type: row.type,
    amount: Number(row.amount),
    date: toRuleDay(row.date),
    merchantName: row.merchantName ?? null,
    description: row.description ?? null,
    cardId: row.cardId ?? null,
    origin: { kind: 'statement', importedAt: null },
  };
}

type ManualRule = SameExpenseRow & { readonly manualId: string };

function manualToRule(m: ImportRuleManualRow): ManualRule {
  return {
    id: m.id,
    manualId: m.id,
    userId: m.userId ?? '',
    paymentSource: m.paymentSource ?? null,
    type: m.type,
    amount: Number(m.amount),
    date: toRuleDay(m.date),
    merchantName: m.merchantName ?? null,
    description: m.description ?? null,
    cardId: m.cardId ?? null,
    expenseNature: m.expenseNature ?? null,
    isAdvance: m.isAdvance ?? null,
    linkedAdvanceIds: m.linkedAdvanceIds ?? null,
    deletedAt: m.deletedAt ?? null,
    bankTransactionId: m.bankTransactionId ?? null,
    bankMatchStatus: m.bankMatchStatus ?? null,
    origin: { kind: 'manual' },
  };
}

/**
 * Odluke pravila za cijeli izvod. Vraća samo retke troška/prihoda;
 * prijenosi i nepoznati tipovi se ne vraćaju (pravilo ih ne dira).
 */
export function decideImportSameExpense(
  ctx: ImportRuleContext,
  imported: readonly ImportRuleBankRow[],
  manuals: readonly ImportRuleManualRow[],
): ImportRuleDecision[] {
  const rows = imported.filter(r => isRuleType(r.type));
  const banks = rows.map(r => bankToRule(r, ctx.userId));
  const pool = manuals.map(manualToRule);
  const results = decideSameExpenseAutoBatch(banks, pool, ctx.cardWallets);

  return results.map((res, i) => {
    const bank = banks[i];
    let candidateIds: string[] = res.passing.map(p => p.id);
    let nameUnknown = false;
    if (res.outcome === 'uncertain') {
      // Kandidati koji su sami za sebe `uncertain` — isto pravilo, jedan po jedan.
      const unsure = pool.filter(m => decideSameExpenseAuto(bank, [m], ctx.cardWallets).outcome === 'uncertain');
      candidateIds = unsure.map(m => m.id);
      nameUnknown = unsure.some(m => sameExpenseMerchantVerdict(m, bank) === 'unknown');
    }
    if (res.outcome === 'none') candidateIds = [];
    return {
      importedIndex: rows[i].index,
      outcome: res.outcome,
      reason: res.reason,
      manualId: res.outcome === 'match' && res.candidate ? res.candidate.id : null,
      candidateIds,
      nameUnknown,
    };
  });
}

/** Mapa kartica `id → payment_source_id` iz korisnikovih novčanika. */
export function buildCardWalletMap(
  sources: ReadonlyArray<{ id: string; cards?: ReadonlyArray<{ id: string }> | null }>,
): CardWalletMap {
  const out: Record<string, string> = {};
  for (const s of sources) for (const c of s.cards ?? []) out[c.id] = s.id;
  return out;
}

/** Kartica novčanika po zadnje 4 znamenke (samo ako je jedinstvena). */
export function resolveCardIdByLast4(
  cards: ReadonlyArray<{ id: string; last_four_digits?: string | null }> | null | undefined,
  last4: string | null | undefined,
): string | null {
  if (!last4 || !cards) return null;
  const hits = cards.filter(c => String(c.last_four_digits ?? '') === String(last4));
  return hits.length === 1 ? hits[0].id : null;
}

/** Samo sigurni parovi (`match`) — za putove bez pregleda pitanja (CSV). */
export function matchImportRowsBySameExpense(
  ctx: ImportRuleContext,
  imported: readonly ImportRuleBankRow[],
  manuals: readonly ImportRuleManualRow[],
): { matches: Array<{ importedIndex: number; manualId: string }> } {
  const matches = decideImportSameExpense(ctx, imported, manuals)
    .filter(d => d.outcome === 'match' && d.manualId)
    .map(d => ({ importedIndex: d.importedIndex, manualId: d.manualId as string }));
  return { matches };
}
