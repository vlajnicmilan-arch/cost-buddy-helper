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

import { areMerchantsSimilar } from './duplicateDetection';
import { deriveComparableName, hasSignificantWord } from './importReview/comparableName';
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
  /**
   * `merchant` — klasično slaganje izvedenog imena uz TOČNO JEDNOG kandidata.
   * `indistinguishable` — deterministički 1:1 par unutar skupine međusobno
   * nerazlučivih kandidata (isti iznos/novčanik/tip, slična imena). Mora biti
   * vidljivo označen u UI-ju i razdvojiv prije potvrde.
   */
  readonly origin: 'merchant' | 'indistinguishable';
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
  /** Ime izdavatelja izvoda; u merchantName se tretira kao prazna stop-vrijednost. */
  readonly statementBankName?: string | null;
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

  /**
   * FAZA 1.5 — AUTOMATSKO UPARIVANJE MEĐUSOBNO NERAZLUČIVIH KANDIDATA.
   *
   * Kad više uvezenih redaka i više ručnih kandidata dijele isti tip, isti
   * novčanik i isti iznos DO CENTA, a njihova izvedena imena su međusobno
   * slična, tada su kandidati nerazlučivi: koji god korisnik odabrao, ishod je
   * identičan. Pitanje u toj situaciji nema odgovor bolji od bacanja novčića,
   * pa se pari deterministički 1:1 (po datumu, pa po id/indeksu).
   *
   * Tvrde ograde:
   *  - svaka strana MORA imati izvedeno ime sa značajnom riječi;
   *  - SVI parovi kandidata (i redaka) moraju biti međusobno slični — jedan
   *    nesličan par gasi cijelu skupinu (Kristina Cerina vs Ana Milanovic);
   *  - iznos identičan do centa, datumski prozor ostaje `maxDayDiff`;
   *  - nijedan kandidat ne smije se iskoristiti dvaput.
   */
  const pairedManualIds = new Set<string>();
  const indistinguishablePairs = new Map<number, string>();
  {
    const groups = new Map<string, Bucket[]>();
    for (const b of buckets) {
      if (!isMatchableType(b.row.type)) continue;
      if (b.candidates.length < 2) continue;
      const key = `${resolvePaymentSourceKey(b.row.paymentSource)}|${b.row.type}|${roundAmount(b.row.amount)}`;
      const list = groups.get(key) ?? [];
      list.push(b);
      groups.set(key, list);
    }

    const namesAllSimilar = (names: readonly string[]): boolean => {
      for (let i = 0; i < names.length; i += 1) {
        for (let j = i + 1; j < names.length; j += 1) {
          if (!areMerchantsSimilar(names[i], names[j])) return false;
        }
      }
      return true;
    };

    for (const [, groupBuckets] of groups) {
      if (groupBuckets.length < 2) continue;

      const candidateById = new Map<string, ClassifierManualCandidate>();
      for (const b of groupBuckets) for (const c of b.candidates) candidateById.set(c.id, c);
      const candidates = Array.from(candidateById.values());
      if (candidates.length < 2) continue;

      const rowNames = groupBuckets.map((b) => deriveComparableName({ ...b.row, statementBankName: input.statementBankName }));
      const candNames = candidates.map((c) => deriveComparableName({ ...c, statementBankName: input.statementBankName }));
      const allNames = [...rowNames, ...candNames];
      if (allNames.some((n) => !n || !hasSignificantWord(n))) continue;
      if (!namesAllSimilar(allNames)) continue;

      const sortedRows = groupBuckets.slice().sort((a, b) => {
        const d = toDayStart(a.row.date) - toDayStart(b.row.date);
        return d !== 0 ? d : a.row.index - b.row.index;
      });
      const sortedCands = candidates.slice().sort((a, b) => {
        const d = toDayStart(a.date) - toDayStart(b.date);
        return d !== 0 ? d : a.id.localeCompare(b.id);
      });

      for (const b of sortedRows) {
        const pick = sortedCands.find(
          (c) => !pairedManualIds.has(c.id) && dayDiff(c.date, b.row.date) <= maxDayDiff,
        );
        if (!pick) continue;
        pairedManualIds.add(pick.id);
        indistinguishablePairs.set(b.row.index, pick.id);
      }
    }

    // Iskorišteni kandidati ispadaju iz svih preostalih skupova.
    if (pairedManualIds.size > 0) {
      for (const b of buckets) {
        if (indistinguishablePairs.has(b.row.index)) continue;
        b.candidates = b.candidates.filter((c) => !pairedManualIds.has(c.id));
      }
    }
  }

  // Phase 2: detect candidates wanted by >=2 imported rows → ambiguous both sides.

  const candidateWantedBy = new Map<string, number[]>();
  for (const b of buckets) {
    if (indistinguishablePairs.has(b.row.index)) continue;
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

  /**
   * FAZA 2.5 — SUŽAVANJE KANDIDATA IMENOM.
   *
   * Ime SAMO IZBACUJE očito krive kandidate iz već postojećeg skupa
   * (iznos + datum + izvor). NIKAD ne stvara nove kandidate i NIKAD ne pretvara
   * pitanje u autoMerge — skup autoMergea je nakon ovoga identičan kao prije.
   *
   * Ograde:
   *  - primjenjuje se SAMO kad ima >= 2 kandidata (jedan kandidat s drugim
   *    imenom je kartično kašnjenje: MAPEI <-> Kera Term — ne dira se);
   *  - izbacuje se samo kad OBA izvedena imena postoje, oba imaju barem jednu
   *    značajnu riječ i `areMerchantsSimilar` kaže "ne";
   *  - ako sužavanje isprazni skup, vraća se PUNI skup (pitanje nikad ne smije
   *    postati "novi redak").
   */
  const narrowByName = (
    row: ClassifierImportedRow,
    candidates: readonly ClassifierManualCandidate[],
  ): ClassifierManualCandidate[] => {
    const all = candidates.slice();
    if (all.length < 2) return all;
    const rowName = deriveComparableName({ ...row, statementBankName: input.statementBankName });
    if (!rowName || !hasSignificantWord(rowName)) return all;
    const kept = all.filter((c) => {
      const candName = deriveComparableName({ ...c, statementBankName: input.statementBankName });
      if (!candName || !hasSignificantWord(candName)) return true;
      return areMerchantsSimilar(rowName, candName);
    });
    return kept.length === 0 ? all : kept;
  };

  /**
   * POZITIVNA POTVRDA IMENOM — uzak rez ranije ograde.
   *
   * Spaja se JER SE IME SLAŽE, nikad "jer je ostao jedini". Zato se traži da
   * OBJE strane imaju izvedeno ime sa značajnom riječi i da
   * `areMerchantsSimilar` kaže "da". Ostane li nakon sužavanja jedan kandidat
   * čije se ime NE slaže (MAPEI SILIKON ↔ Kera Term) → i dalje pitanje.
   */
  const positivelyUsedIds = new Set<string>();
  const positiveMatch = (
    row: ClassifierImportedRow,
    cand: ClassifierManualCandidate,
  ): boolean => {
    if (positivelyUsedIds.has(cand.id)) return false;
    const rowName = deriveComparableName({ ...row, statementBankName: input.statementBankName });
    const candName = deriveComparableName({ ...cand, statementBankName: input.statementBankName });
    if (!rowName || !hasSignificantWord(rowName)) return false;
    if (!candName || !hasSignificantWord(candName)) return false;
    return areMerchantsSimilar(rowName, candName);
  };

  // Phase 3: classify.
  for (const b of buckets) {
    const idx = b.row.index;

    const paired = indistinguishablePairs.get(idx);
    if (paired) {
      autoMerge.push({ importedIndex: idx, manualId: paired, origin: 'indistinguishable' });
      continue;
    }

    if (!isMatchableType(b.row.type)) {
      // Transferi i nepoznati tipovi ne mogu se auto-mergat — idu kroz "new"
      // put (kasnije se posebno rješavaju kao transfer par).
      newRows.push(idx);
      continue;
    }

    const available = b.candidates.filter((c) => !positivelyUsedIds.has(c.id));

    if (available.length === 0) {
      newRows.push(idx);
      continue;
    }

    // Pozitivna potvrda dolazi u obzir SAMO ondje gdje je sužavanje imalo što
    // suziti (izvorno >= 2 kandidata). Kolizija oko jedinog zajedničkog
    // kandidata ostaje pitanje kao i prije.
    if (b.candidates.length >= 2) {
      const narrowed = narrowByName(b.row, available);
      if (narrowed.length === 1 && positiveMatch(b.row, narrowed[0])) {
        positivelyUsedIds.add(narrowed[0].id);
        autoMerge.push({ importedIndex: idx, manualId: narrowed[0].id, origin: 'merchant' });
        continue;
      }
      questions.push({
        importedIndex: idx,
        reason: 'ambiguous',
        candidateIds: narrowed.map((c) => c.id),
      });
      continue;
    }

    if (crossAmbiguousIndices.has(idx)) {
      questions.push({
        importedIndex: idx,
        reason: 'ambiguous',
        candidateIds: available.map((c) => c.id),
      });
      continue;
    }



    // Exactly one candidate → izvedeno ime (merchant → opis) odlučuje.
    const cand = available[0];
    const bankName = deriveComparableName({ ...b.row, statementBankName: input.statementBankName });
    const manualName = deriveComparableName({ ...cand, statementBankName: input.statementBankName });

    if (!manualName || !hasSignificantWord(manualName)) {
      // Ručni red nema nikakvo upotrebljivo ime → pitanje.
      questions.push({
        importedIndex: idx,
        reason: 'no_merchant',
        candidateIds: [cand.id],
      });
      continue;
    }

    if (!bankName || !hasSignificantWord(bankName)) {
      questions.push({
        importedIndex: idx,
        reason: 'no_merchant',
        candidateIds: [cand.id],
      });
      continue;
    }

    if (areMerchantsSimilar(bankName, manualName)) {
      positivelyUsedIds.add(cand.id);
      autoMerge.push({ importedIndex: idx, manualId: cand.id, origin: 'merchant' });
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
