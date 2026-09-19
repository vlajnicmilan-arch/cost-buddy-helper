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
  /** Redak uparen s postojećim prijenosom — ne ulazi u prag obrasca. */
  readonly pairedExistingId?: string | null;
  /** Novčanik čiji se izvod uvozi (iz uvezene transakcije). */
  readonly paymentSource?: string | null;
  /** Tip iz uvezene transakcije; ima prednost pred `type`. */
  readonly txType?: string | null;
  /** Smjer iz predznaka retka na izvodu (pdfPostProcess `statement_direction`). */
  readonly statementDirection?: MoneyDirection | null;
  /** Iznos retka (predznak) — rezervni izvor smjera kad nema statementDirection. */
  readonly amount?: number | null;
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

/**
 * Smjer koji izvod nosi za taj redak; `null` = izvod ga ne nosi.
 * Redom: spremljeni predznak (`statement_direction`) → predznak iznosa
 * (negativan = 'out', pozitivan uz tip income = 'in') → tip retka
 * (expense/income). Tip 'transfer' SAM PO SEBI ne nosi smjer.
 */
function directionOf(row: PatternSelectionRow): MoneyDirection | null {
  if (row.statementDirection === 'in' || row.statementDirection === 'out') {
    return row.statementDirection;
  }
  const amount = row.amount ?? null;
  if (amount !== null && Number.isFinite(amount) && amount !== 0) {
    if (amount < 0) return 'out';
    const type = row.txType ?? row.type ?? null;
    if (type === 'income') return 'in';
  }
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
      const direction = td.direction ?? directionOf(row);
      if (!td.targetIncomeSourceId || !direction) continue;
      manual.push({
        index: row.index,
        merchantKey: td.merchantKey ?? parts.merchantKey,
        sourceWalletKey: td.sourceWalletKey ?? parts.sourceWalletKey,
        direction,
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
