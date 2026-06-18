/**
 * Pure helper: match imported statement rows against the user's existing
 * manual entries so we can auto-confirm them (instead of creating a duplicate
 * row from the bank statement).
 *
 * Match criteria (intentionally strict to keep false-positives low):
 *   - same payment_source
 *   - same type (expense or income; transfers are skipped)
 *   - same amount (rounded to 2 decimals)
 *   - |date - importedDate| <= maxDayDiff (default 1)
 *
 * Resolution rules:
 *   - Exactly 1 manual candidate matches an imported row → merge.
 *   - 0 candidates → imported row is "unmatched" → goes through normal upsert.
 *   - >= 2 candidates → "ambiguous" → we DO NOT merge (avoid wrong merge);
 *     row also goes through normal upsert.
 *
 * Each manual candidate is consumed at most once (first imported row wins).
 *
 * Pure module — no React, no Supabase. Easy to unit-test.
 */

import { resolvePaymentSourceKey } from './paymentSource/resolve';



export interface ImportedRowForMatch {
  /** Stable index in the caller's imported rows array. */
  readonly index: number;
  readonly paymentSource: string | null | undefined;
  readonly type: string;
  readonly amount: number;
  readonly date: Date | string;
}

export interface ManualCandidate {
  readonly id: string;
  readonly paymentSource: string | null | undefined;
  readonly type: string;
  readonly amount: number;
  readonly date: Date | string;
}

export interface MatchResult {
  readonly importedIndex: number;
  readonly manualId: string;
}

export interface MatchOutput {
  /** 1:1 matches that should be merged. */
  readonly matches: MatchResult[];
  /** Imported indices that had 2+ candidates (skipped, treated as new). */
  readonly ambiguous: number[];
  /** Imported indices with no candidate. */
  readonly unmatched: number[];
}

export interface MatchInput {
  readonly imported: readonly ImportedRowForMatch[];
  readonly manualCandidates: readonly ManualCandidate[];
  /** Allowed day delta. Defaults to 1 (banks often post a day late). */
  readonly maxDayDiff?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDayStart(d: Date | string): number {
  const date = d instanceof Date ? new Date(d.getTime()) : new Date(d);
  if (Number.isNaN(date.getTime())) return Number.NaN;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dayDiff(a: Date | string, b: Date | string): number {
  const ta = toDayStart(a);
  const tb = toDayStart(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(ta - tb) / MS_PER_DAY;
}

function roundAmount(n: number): string {
  if (!Number.isFinite(n)) return '0.00';
  return Number(n).toFixed(2);
}

function isMatchableType(t: string): boolean {
  // Auto-merge sada pokriva i transfere (npr. ručni "Aircash dopuna" vs
  // bankovni "Uplata gotovine na Aircash"). Isti payment_source + iznos + ±1d
  // ostaju uvjeti.
  return t === 'expense' || t === 'income' || t === 'transfer';
}

function sameSource(a: string | null | undefined, b: string | null | undefined): boolean {
  // Tolerant compare: raw UUID and `custom:UUID` collapse to the same key
  // (Foundation Plan, Val 1 read-side resolver).
  return resolvePaymentSourceKey(a) === resolvePaymentSourceKey(b);
}

export function matchManualToImported(input: MatchInput): MatchOutput {
  const maxDayDiff = input.maxDayDiff ?? 1;
  const matches: MatchResult[] = [];
  const ambiguous: number[] = [];
  const unmatched: number[] = [];
  const consumed = new Set<string>();

  for (const row of input.imported) {
    if (!isMatchableType(row.type)) {
      // Transfers and unknown types are never auto-merged.
      unmatched.push(row.index);
      continue;
    }
    const importedAmount = roundAmount(row.amount);

    const candidates = input.manualCandidates.filter((c) => {
      if (consumed.has(c.id)) return false;
      if (c.type !== row.type) return false;
      if (!sameSource(c.paymentSource, row.paymentSource)) return false;
      if (roundAmount(c.amount) !== importedAmount) return false;
      return dayDiff(c.date, row.date) <= maxDayDiff;
    });

    if (candidates.length === 1) {
      matches.push({ importedIndex: row.index, manualId: candidates[0].id });
      consumed.add(candidates[0].id);
    } else if (candidates.length >= 2) {
      ambiguous.push(row.index);
    } else {
      unmatched.push(row.index);
    }
  }

  return { matches, ambiguous, unmatched };
}
