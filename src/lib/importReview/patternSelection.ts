/**
 * ODABIR ULAZA ZA OBRAZAC SERIJE (/import-review) — čista, testabilna funkcija.
 *
 * Izdvojeno iz `ImportReview.tsx` useEffect-a da bi se pravilo moglo testirati
 * bez Reacta. Ništa se ovdje ne upisuje — rezultat je samo ulaz za
 * `computePatternFill`, a odluke i dalje mora proći "Potvrdi uvoz".
 *
 * Nepregovaračko:
 * - Kandidati su NEODLUČENI redci: čisti `new` redci I `transfer` redci s
 *   PRAZNIM ciljem (ti su prije ispadali pa se serija nije popunjavala).
 * - Otisak, ponuda kasne kartice i odgovoreno pitanje isključuju redak.
 * - Kad nema imena trgovca, ključ se izvodi iz normaliziranog imena
 *   protustrane u opisu — ISTO za ručne odluke i za kandidate.
 */

import { buildTransferRuleKey } from './transferRules';
import { resolvePaymentSourceKey } from '../paymentSource/resolve';
import { normalizeCounterparty } from '../transferCounterpart';
import { statementDirectionFromType } from './transferDirection';
import type { MoneyDirection } from '../moneyDirection';
import type { PatternCandidateRow, PatternManualDecision } from './patternFill';

/** Minimalan oblik retka koji obrazac treba — bez ovisnosti o UI tipovima. */
export interface PatternSelectionRow {
  readonly index: number;
  readonly type?: string | null;
  readonly merchantName?: string | null;
  readonly description?: string | null;
  readonly classificationKind: string;
  /** Kod `transfer` klasifikacije: predodabrani cilj (prazno = nije odlučeno). */
  readonly classificationTargetIncomeSourceId?: string | null;
  readonly existsByFingerprint?: boolean;
  readonly lateMatchOffer?: string | null;
  /** Novčanik čiji se izvod uvozi (iz uvezene transakcije). */
  readonly paymentSource?: string | null;
  /** Tip iz uvezene transakcije; ima prednost pred `type`. */
  readonly txType?: string | null;
}

export interface PatternSelectionDecision {
  readonly enabled: boolean;
  readonly targetIncomeSourceId: string;
  readonly direction: MoneyDirection | null;
  readonly rememberRule: boolean;
  readonly merchantKey: string | null;
  readonly sourceWalletKey: string | null;
}

export interface PatternSelectionInput {
  readonly rows: readonly PatternSelectionRow[];
  readonly transfers: Readonly<Record<number, PatternSelectionDecision | null | undefined>>;
  readonly answeredQuestions?: Readonly<Record<number, unknown>>;
  /** Retci popunjeni obrascem — ne broje se u prag. */
  readonly autoFilled?: Readonly<Record<number, boolean>>;
}

export interface PatternSelectionResult {
  readonly manual: PatternManualDecision[];
  readonly candidates: PatternCandidateRow[];
}

function keyPartsOf(row: PatternSelectionRow): {
  merchantKey: string | null;
  sourceWalletKey: string | null;
} {
  const ruleKey = buildTransferRuleKey({
    merchantName: row.merchantName ?? null,
    paymentSource: row.paymentSource ?? null,
  });
  if (ruleKey) return ruleKey;
  const walletKey = resolvePaymentSourceKey(row.paymentSource ?? null);
  const fromDescription = normalizeCounterparty(row.description ?? null);
  return {
    merchantKey: fromDescription || null,
    sourceWalletKey: walletKey === '__unknown__' ? null : walletKey,
  };
}

/** Smjer koji izvod nosi za taj redak; `null` = izvod ga ne nosi. */
function directionOf(row: PatternSelectionRow): MoneyDirection | null {
  return statementDirectionFromType(row.txType ?? row.type ?? null);
}

export function selectPatternInputs(input: PatternSelectionInput): PatternSelectionResult {
  const autoFilled = input.autoFilled ?? {};
  const answered = input.answeredQuestions ?? {};
  const manual: PatternManualDecision[] = [];
  const candidates: PatternCandidateRow[] = [];

  for (const row of input.rows) {
    const parts = keyPartsOf(row);
    const td = input.transfers[row.index];

    if (td) {
      if (!td.enabled) continue;            // korisnik je rekao "nije prijenos"
      if (autoFilled[row.index]) continue;  // auto-popunjeno se NE broji u prag
      if (!td.targetIncomeSourceId || !td.direction) continue;
      manual.push({
        index: row.index,
        merchantKey: td.merchantKey ?? parts.merchantKey,
        sourceWalletKey: td.sourceWalletKey ?? parts.sourceWalletKey,
        direction: td.direction,
        targetIncomeSourceId: td.targetIncomeSourceId,
        remember: td.rememberRule === true,
      });
      continue;
    }

    if (row.existsByFingerprint) continue;
    if (row.lateMatchOffer) continue;
    if (answered[row.index]) continue;

    const isNew = row.classificationKind === 'new';
    const isOpenTransfer =
      row.classificationKind === 'transfer' && !row.classificationTargetIncomeSourceId;
    if (!isNew && !isOpenTransfer) continue;

    candidates.push({
      index: row.index,
      merchantKey: parts.merchantKey,
      sourceWalletKey: parts.sourceWalletKey,
      direction: directionOf(row),
    });
  }

  return { manual, candidates };
}
