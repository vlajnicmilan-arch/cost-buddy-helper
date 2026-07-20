/**
 * Import classifier — merchant-aware routing for statement import (Korak 3a).
 *
 * Given a batch of imported bank rows and a pool of user's existing manual
 * entries (bank_transaction_id NULL) on the SAME payment_source, produce a
 * three-way split for the review dialog:
 *
 *   autoMerge  — 1:1 candidate with matching normalized merchant
 *   questions  — needs explicit user decision, with a reason:
 *                  'merchant_mismatch' — both sides have merchant, they differ
 *                  'no_merchant'       — manual side has no merchant_name
 *                  'ambiguous'         — >=2 candidates for one imported row
 *                                        OR >=2 imported rows for one candidate
 *   newRows    — no candidate at all
 *
 * Rules (per Milanova odluka):
 *   - candidate = same user + payment_source + type + amount(2dp) + |date| <= 1 day
 *   - transfers NEVER auto-merge (parni leg — obradi se posebno)
 *   - description je SAMO hint u UI-ju, NIKAD ne odlučuje o merge-u
 *   - a manual candidate can back at most one imported row (first wins);
 *     if two imports both matched the same candidate → both go to 'ambiguous'
 *
 * Pure module — no React, no Supabase. Easy to unit-test.
 *
 * Uses the SAME normalizeMerchant as duplicateDetection.ts / importFingerprint.ts
 * so "ALE-HOP" ≡ "Ale Hop" ≡ "ale hop" collapse to the same key.
 */

import { normalizeMerchant } from './duplicateDetection';
import { resolvePaymentSourceKey } from './paymentSource/resolve';

export type QuestionReason = 'merchant_mismatch' | 'no_merchant' | 'ambiguous';

export interface ClassifierImportedRow {
  readonly index: number;
  readonly paymentSource: string | null | undefined;
  readonly type: string;
  readonly amount: number;
  readonly date: Date | string;
  readonly merchantName?: string | null;
  readonly description?: string | null;
}

export interface ClassifierManualCandidate {
  readonly id: string;
  readonly paymentSource: string | null | undefined;
  readonly type: string;
  readonly amount: number;
  readonly date: Date | string;
  readonly merchantName?: string | null;
  readonly description?: string | null;
}

export interface AutoMergePair {
  readonly importedIndex: number;
  readonly manualId: string;
}

export interface QuestionEntry {
  readonly importedIndex: number;
  readonly reason: QuestionReason;
  /** IDs of every manual candidate that qualified (may be 0 for merchant_mismatch/no_merchant when only 1 candidate). */
  readonly candidateIds: string[];
}

export interface ClassifierOutput {
  readonly autoMerge: AutoMergePair[];
  readonly questions: QuestionEntry[];
  readonly newRows: number[];
}

export interface ClassifierInput {
  readonly imported: readonly ClassifierImportedRow[];
  readonly manualCandidates: readonly ClassifierManualCandidate[];
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
  // Transferi imaju parni leg (out/in) na različitim izvorima — nikad ih ne
  // spajamo automatski u statement importu.
  return t === 'expense' || t === 'income';
}

function sameSource(a: string | null | undefined, b: string | null | undefined): boolean {
  return resolvePaymentSourceKey(a) === resolvePaymentSourceKey(b);
}

/**
 * Classify each imported row into autoMerge / question / newRow.
 *
 * Two-phase resolution:
 *   1) Collect eligible candidates per imported row (source+type+amount+date).
 *   2) Detect cross-collisions (one manual candidate wanted by >=2 imports)
 *      and demote them ALL to 'ambiguous'.
 *   3) For the remaining rows: merchant compare decides autoMerge vs question.
 */
export function classifyImport(input: ClassifierInput): ClassifierOutput {
  const maxDayDiff = input.maxDayDiff ?? 1;
  const autoMerge: AutoMergePair[] = [];
  const questions: QuestionEntry[] = [];
  const newRows: number[] = [];

  // Phase 1: candidate collection per imported row.
  type Bucket = { row: ClassifierImportedRow; candidates: ClassifierManualCandidate[] };
  const buckets: Bucket[] = input.imported.map((row) => {
    if (!isMatchableType(row.type)) return { row, candidates: [] };
    const importedAmount = roundAmount(row.amount);
    const candidates = input.manualCandidates.filter((c) => {
      if (c.type !== row.type) return false;
      if (!sameSource(c.paymentSource, row.paymentSource)) return false;
      if (roundAmount(c.amount) !== importedAmount) return false;
      return dayDiff(c.date, row.date) <= maxDayDiff;
    });
    return { row, candidates };
  });

  // Phase 2: detect candidates wanted by >=2 imported rows → ambiguous both sides.
  const candidateWantedBy = new Map<string, number[]>();
  for (const b of buckets) {
    for (const c of b.candidates) {
      const list = candidateWantedBy.get(c.id) ?? [];
      list.push(b.row.index);
      candidateWantedBy.set(c.id, list);
    }
  }
  const crossAmbiguousIndices = new Set<number>();
  for (const [, importedIdxs] of candidateWantedBy) {
    if (importedIdxs.length >= 2) {
      for (const idx of importedIdxs) crossAmbiguousIndices.add(idx);
    }
  }

  // Phase 3: classify.
  for (const b of buckets) {
    const idx = b.row.index;

    if (!isMatchableType(b.row.type)) {
      // Transferi i nepoznati tipovi ne mogu se auto-mergat — idu kroz "new"
      // put (kasnije se posebno rješavaju kao transfer par).
      newRows.push(idx);
      continue;
    }

    if (b.candidates.length === 0) {
      newRows.push(idx);
      continue;
    }

    if (crossAmbiguousIndices.has(idx)) {
      questions.push({
        importedIndex: idx,
        reason: 'ambiguous',
        candidateIds: b.candidates.map((c) => c.id),
      });
      continue;
    }

    if (b.candidates.length >= 2) {
      questions.push({
        importedIndex: idx,
        reason: 'ambiguous',
        candidateIds: b.candidates.map((c) => c.id),
      });
      continue;
    }

    // Exactly one candidate → merchant compare decides.
    const cand = b.candidates[0];
    const bankMerchant = normalizeMerchant(b.row.merchantName ?? '');
    const manualMerchant = normalizeMerchant(cand.merchantName ?? '');

    if (!manualMerchant) {
      // Ručni red nema merchant_name → pitanje. Description je SAMO hint u UI-ju.
      questions.push({
        importedIndex: idx,
        reason: 'no_merchant',
        candidateIds: [cand.id],
      });
      continue;
    }

    if (!bankMerchant) {
      // Bank red nema merchant (npr. čist transfer/kartično bez merchant polja) —
      // ne možemo dokazati slaganje. Tretiraj kao no_merchant (isti UI put).
      questions.push({
        importedIndex: idx,
        reason: 'no_merchant',
        candidateIds: [cand.id],
      });
      continue;
    }

    // Oba imaju merchant — provjera slaganja.
    const merchantsMatch =
      bankMerchant === manualMerchant ||
      bankMerchant.includes(manualMerchant) ||
      manualMerchant.includes(bankMerchant);

    if (merchantsMatch) {
      autoMerge.push({ importedIndex: idx, manualId: cand.id });
    } else {
      questions.push({
        importedIndex: idx,
        reason: 'merchant_mismatch',
        candidateIds: [cand.id],
      });
    }
  }

  return { autoMerge, questions, newRows };
}
