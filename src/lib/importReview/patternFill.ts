/**
 * UČENJE UNUTAR ISTE SERIJE — "popuni ostale po mom obrascu".
 *
 * Nakon DVIJE istovjetne korisnikove odluke o prijenosu na istom ključu
 * (isti normalizirani trgovac + isti izvorni novčanik + isti smjer), preostali
 * NEODLUČENI redci istog ključa se automatski popune istim izborom.
 *
 * Nepregovaračko:
 * - JEDNA odluka nikad ništa ne pokreće (jedna je slučajnost).
 * - IZNOS JE NEBITAN — ključ ga ne sadrži.
 * - NIKAD preko različitih trgovaca, novčanika ili smjera.
 * - Popunjavanje je samo prijedlog u nacrtu; ništa ne ulazi u knjige do
 *   "Potvrdi uvoz". Ne dira ponudu kasne kartice, pitanja, spajanja,
 *   needs_explanation, fingerprint ni poravnanje.
 *
 * React-free i bez IO — u cijelosti testabilno.
 */

import type { MoneyDirection } from '../moneyDirection';

/** Broj istovjetnih korisnikovih odluka nakon kojih se obrazac primjenjuje. */
export const PATTERN_FILL_THRESHOLD = 2;

export interface PatternKeyParts {
  readonly merchantKey: string | null;
  readonly sourceWalletKey: string | null;
  readonly direction: MoneyDirection | null;
}

/** `null` = redak nema dovoljno identiteta da bi uopće sudjelovao u obrascu. */
export function buildPatternKey(parts: PatternKeyParts): string | null {
  const { merchantKey, sourceWalletKey, direction } = parts;
  if (!merchantKey || !sourceWalletKey || !direction) return null;
  return `${merchantKey}::${sourceWalletKey}::${direction}`;
}

/** Korisnikova RUČNA odluka o prijenosu (auto-popunjeni redci se NE broje). */
export interface PatternManualDecision extends PatternKeyParts {
  readonly index: number;
  readonly targetIncomeSourceId: string;
}

/** Neodlučeni redak koji smije primiti obrazac. */
export interface PatternCandidateRow extends PatternKeyParts {
  readonly index: number;
}

export interface PatternFillResult {
  readonly index: number;
  readonly targetIncomeSourceId: string;
  readonly direction: MoneyDirection;
  readonly merchantKey: string;
  readonly sourceWalletKey: string;
}

export interface ComputePatternFillInput {
  /** Ručne odluke korisnika u ovoj seriji. */
  readonly manual: readonly PatternManualDecision[];
  /** Redci bez odluke koji su podobni za popunjavanje. */
  readonly candidates: readonly PatternCandidateRow[];
  /** Indeksi koje korisnik izričito ne želi popunjavati (npr. nakon "Poništi"). */
  readonly excluded?: readonly number[];
}

/**
 * Vraća popis redaka koje treba popuniti. Prazno kad prag nije dosegnut ili
 * kad se ručne odluke na istom ključu ne slažu oko cilja.
 */
export function computePatternFill(input: ComputePatternFillInput): PatternFillResult[] {
  const excluded = new Set(input.excluded ?? []);

  // key -> skup ciljeva; više od jednog cilja znači da obrazac nije jednoznačan.
  const byKey = new Map<string, { targets: Set<string>; count: number }>();
  for (const d of input.manual) {
    const key = buildPatternKey(d);
    if (!key || !d.targetIncomeSourceId) continue;
    const entry = byKey.get(key) ?? { targets: new Set<string>(), count: 0 };
    entry.targets.add(d.targetIncomeSourceId);
    entry.count += 1;
    byKey.set(key, entry);
  }

  const out: PatternFillResult[] = [];
  for (const row of input.candidates) {
    if (excluded.has(row.index)) continue;
    const key = buildPatternKey(row);
    if (!key) continue;
    const entry = byKey.get(key);
    if (!entry) continue;
    if (entry.count < PATTERN_FILL_THRESHOLD) continue;
    if (entry.targets.size !== 1) continue;
    const [target] = Array.from(entry.targets);
    out.push({
      index: row.index,
      targetIncomeSourceId: target,
      direction: row.direction as MoneyDirection,
      merchantKey: row.merchantKey as string,
      sourceWalletKey: row.sourceWalletKey as string,
    });
  }
  return out;
}
