/**
 * OBRAZAC SERIJE — ODGOVORI NA PITANJA.
 *
 * Isti princip kao `patternFill.ts` (prijenosi), samo nad odgovorima na
 * pitanja: nakon DVIJE istovjetne korisnikove odluke na istom ključu
 * (izvedeno ime retka + isti novčanik), preostala NEODGOVORENA pitanja istog
 * ključa dobiju isti odgovor.
 *
 * Nepregovaračko:
 * - IZNOS JE NEBITAN — ključ ga ne sadrži.
 * - Auto-popunjeni odgovori se NE broje u prag (nema samopojačanja).
 * - Ovo NIJE autoMerge: odluka je vidljivo popunjena i ulazi u knjige tek na
 *   "Potvrdi uvoz"; ručna izmjena je uvijek jača.
 * - "Spoji s postojećim" se smije primijeniti SAMO kad pitanje ima TOČNO
 *   JEDNOG kandidata i kad je izvedeno ime tog kandidata isto kao u ručnoj
 *   odluci. Nikad "spoji s bilo čim".
 *
 * Čisti modul — bez Reacta i IO-a.
 */

import { PATTERN_FILL_THRESHOLD } from './patternFill';

export { PATTERN_FILL_THRESHOLD };

export interface QuestionKeyParts {
  /** Izvedeno ime retka izvoda (`deriveComparableName`). */
  readonly nameKey: string | null;
  readonly sourceWalletKey: string | null;
}

/** `null` = redak nema dovoljno identiteta da sudjeluje u obrascu. */
export function buildQuestionPatternKey(parts: QuestionKeyParts): string | null {
  const { nameKey, sourceWalletKey } = parts;
  if (!nameKey || !sourceWalletKey) return null;
  return `${nameKey}::${sourceWalletKey}`;
}

/** Vrsta odgovora u obrascu — "novi redak" ili "spoji s imenom X". */
export type QuestionPatternAnswer =
  | { readonly choice: 'new' }
  | { readonly choice: 'merge'; readonly candidateNameKey: string };

function answerSignature(a: QuestionPatternAnswer): string {
  return a.choice === 'new' ? 'new' : `merge::${a.candidateNameKey}`;
}

export interface QuestionManualDecision extends QuestionKeyParts {
  readonly index: number;
  readonly answer: QuestionPatternAnswer;
}

export interface QuestionCandidateOption {
  readonly id: string;
  readonly nameKey: string | null;
}

export interface QuestionCandidateRow extends QuestionKeyParts {
  readonly index: number;
  /** Ponuđeni ručni kandidati tog pitanja. */
  readonly candidates: readonly QuestionCandidateOption[];
}

export type QuestionPatternResolvedAnswer =
  | { readonly choice: 'new' }
  | { readonly choice: 'merge'; readonly manualId: string };

export interface QuestionPatternFillResult {
  readonly index: number;
  readonly answer: QuestionPatternResolvedAnswer;
}

export interface ComputeQuestionPatternFillInput {
  readonly manual: readonly QuestionManualDecision[];
  readonly candidates: readonly QuestionCandidateRow[];
  readonly excluded?: readonly number[];
}

export function computeQuestionPatternFill(
  input: ComputeQuestionPatternFillInput,
): QuestionPatternFillResult[] {
  const excluded = new Set(input.excluded ?? []);

  const byKey = new Map<string, { answers: Map<string, QuestionPatternAnswer>; count: number }>();
  for (const d of input.manual) {
    const key = buildQuestionPatternKey(d);
    if (!key) continue;
    const entry = byKey.get(key) ?? { answers: new Map<string, QuestionPatternAnswer>(), count: 0 };
    entry.answers.set(answerSignature(d.answer), d.answer);
    entry.count += 1;
    byKey.set(key, entry);
  }

  const out: QuestionPatternFillResult[] = [];
  for (const row of input.candidates) {
    if (excluded.has(row.index)) continue;
    const key = buildQuestionPatternKey(row);
    if (!key) continue;
    const entry = byKey.get(key);
    if (!entry) continue;
    if (entry.count < PATTERN_FILL_THRESHOLD) continue;
    if (entry.answers.size !== 1) continue;
    const [answer] = Array.from(entry.answers.values());

    if (answer.choice === 'new') {
      out.push({ index: row.index, answer: { choice: 'new' } });
      continue;
    }

    // "Spoji": samo jednoznačan slučaj — točno jedan kandidat, istog imena.
    if (row.candidates.length !== 1) continue;
    const cand = row.candidates[0];
    if (!cand.nameKey || cand.nameKey !== answer.candidateNameKey) continue;
    out.push({ index: row.index, answer: { choice: 'merge', manualId: cand.id } });
  }
  return out;
}
