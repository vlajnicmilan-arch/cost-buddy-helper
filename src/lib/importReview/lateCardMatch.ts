/**
 * PONUDA SPAJANJA — kartično kašnjenje (late card match).
 *
 * Kartično plaćanje sjeda na izvod NAKON što je korisnik ručno/skenirano
 * zabilježio trošak. Postojeći `classifyImport` gleda prozor ±1 dan i traži
 * merchant slaganje — kartično kašnjenje od 2–3 dana mu izmakne, pa redak
 * izvoda završi kao "novi".
 *
 * Ovaj modul NUDI spajanje takvih parova, uz ČETIRI TVRDE OGRADE:
 *
 *  a) IZNOS IDENTIČAN DO CENTA — nikad "sličan", nikad raspon.
 *  b) JEDNOSMJERAN UZAK PROZOR — ručni unos PRIJE, redak izvoda isti dan do
 *     +{@link DEFAULT_MAX_DAYS_AFTER} dana POSLIJE. Redak izvoda stariji od
 *     ručnog NIKAD nije kandidat. Isti novčanik, isti tip.
 *  c) NIKAD AUTOMATSKO SPAJANJE — rezultat je isključivo PONUDA na pregledu
 *     uvoza; zadano stanje ostaje "razdvojeno" (uvoz kao novi redak).
 *  d) JEDAN-NA-JEDAN — ako za isti iznos u prozoru postoje ≥2 kandidata s
 *     bilo koje strane, aplikacija ŠUTI (nula ponude). Nauk "Lidl 1,29".
 *
 * Merchant se NE uspoređuje (kartični opis banke je drugo ime: "MAPEI
 * SILIKON" ↔ "Kera Term Trgovina, Zadar"). Zato su ograde iznad stroge.
 *
 * Čisti modul — bez Reacta i Supabasea.
 */

import { resolvePaymentSourceKey } from '@/lib/paymentSource/resolve';

export const DEFAULT_MAX_DAYS_AFTER = 3;

export interface LateMatchImportedRow {
  readonly index: number;
  readonly paymentSource: string | null | undefined;
  readonly type: string;
  readonly amount: number;
  readonly date: Date | string;
}

export interface LateMatchManualRow {
  readonly id: string;
  readonly paymentSource: string | null | undefined;
  readonly type: string;
  readonly amount: number;
  readonly date: Date | string;
}

export interface LateCardMatchOffer {
  readonly importedIndex: number;
  readonly manualId: string;
}

export interface LateCardMatchInput {
  readonly imported: readonly LateMatchImportedRow[];
  readonly manualCandidates: readonly LateMatchManualRow[];
  readonly maxDaysAfter?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDayStart(d: Date | string): number {
  const date = d instanceof Date ? new Date(d.getTime()) : new Date(d);
  if (Number.isNaN(date.getTime())) return Number.NaN;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Cijeli centi kao string — jedina dopuštena usporedba iznosa. */
function centKey(n: number): string | null {
  if (!Number.isFinite(n)) return null;
  return Number(n).toFixed(2);
}

function isMatchableType(t: string): boolean {
  return t === 'expense' || t === 'income';
}

/**
 * Vrati ponude spajanja (najviše jedna po uvezenom retku). Prazno polje =
 * aplikacija šuti.
 */
export function findLateCardMatches(input: LateCardMatchInput): LateCardMatchOffer[] {
  const maxDaysAfter = input.maxDaysAfter ?? DEFAULT_MAX_DAYS_AFTER;

  // Faza 1 — kandidati po uvezenom retku uz sve četiri ograde osim 1:1.
  const perImported = new Map<number, string[]>();
  for (const row of input.imported) {
    if (!isMatchableType(row.type)) continue;
    const amount = centKey(row.amount);
    if (amount === null) continue;
    const bankDay = toDayStart(row.date);
    if (Number.isNaN(bankDay)) continue;

    const hits: string[] = [];
    for (const manual of input.manualCandidates) {
      if (manual.type !== row.type) continue;
      if (resolvePaymentSourceKey(manual.paymentSource) !== resolvePaymentSourceKey(row.paymentSource)) continue;
      if (centKey(manual.amount) !== amount) continue;
      const manualDay = toDayStart(manual.date);
      if (Number.isNaN(manualDay)) continue;
      // Jednosmjerno: ručni unos prije (ili isti dan), izvod do +N dana poslije.
      const diffDays = (bankDay - manualDay) / MS_PER_DAY;
      if (diffDays < 0 || diffDays > maxDaysAfter) continue;
      hits.push(manual.id);
    }
    if (hits.length > 0) perImported.set(row.index, hits);
  }

  // Faza 2 — 1:1 ograda s obje strane.
  const wantedBy = new Map<string, number[]>();
  for (const [idx, ids] of perImported) {
    for (const id of ids) {
      const list = wantedBy.get(id) ?? [];
      list.push(idx);
      wantedBy.set(id, list);
    }
  }

  const offers: LateCardMatchOffer[] = [];
  for (const [idx, ids] of perImported) {
    if (ids.length !== 1) continue;                       // ≥2 kandidata → šutnja
    const manualId = ids[0];
    if ((wantedBy.get(manualId) ?? []).length !== 1) continue; // ≥2 izvoda na isti ručni → šutnja
    offers.push({ importedIndex: idx, manualId });
  }

  return offers.sort((a, b) => a.importedIndex - b.importedIndex);
}
