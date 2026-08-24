/**
 * Import Review — pure reducer / gating helpers.
 *
 * No React, no DOM. Fully testable.
 */

import type {
  ImportReviewDecisions,
  ImportReviewPayload,
  ImportReviewRow,
  QuestionAnswer,
  TransferDecision,
} from './types';

export function buildInitialDecisions(payload: ImportReviewPayload): ImportReviewDecisions {
  const autoMerge: Record<number, boolean> = {};
  const questions: Record<number, QuestionAnswer | null> = {};
  const newRows: Record<number, boolean> = {};
  const transfers: Record<number, TransferDecision | null> = {};

  for (const row of payload.rows) {
    switch (row.classification.kind) {
      case 'auto_merge':
        // Default ON — spec §4 "Auto-spojevi checkbox default ON".
        autoMerge[row.index] = true;
        // "Razdvoji" put: automatski upareni nerazlučivi kandidati mogu se
        // prebaciti u "novi redak" prije potvrde.
        if (row.classification.origin === 'indistinguishable') newRows[row.index] = false;
        break;
      case 'question':
        // No default — blocking gate.
        questions[row.index] = null;
        break;
      case 'new':
        // Default ON, ali OFF (i disabled) kad postoji fingerprint hit ili kad
        // otisak pripada ranije obrisanom retku (koji se ne vraća sam).
        newRows[row.index] =
          !row.classification.existsByFingerprint && row.classification.deletedByFingerprint !== true;
        break;
      case 'transfer':
        // Rule already matched → default ON, rememberRule=false (rule postoji).
        transfers[row.index] = {
          enabled: true,
          targetIncomeSourceId: row.classification.targetIncomeSourceId,
          direction: row.classification.direction,
          rememberRule: false,
          merchantKey: null,
          sourceWalletKey: null,
        };
        break;
    }
  }

  // ZADANO PRAZNO — nijedan redak ne dolazi označen. Oznaka "Bez objašnjenja"
  // postoji samo ako je korisnik sam klikne.
  // ZADANO PRAZNO i za "Vrati u knjige" — obrisani redak se ne vraća sam.
  return { autoMerge, questions, newRows, transfers, needsExplanation: {}, restoreDeleted: {} };
}

export function setAutoMerge(
  decisions: ImportReviewDecisions,
  index: number,
  value: boolean,
): ImportReviewDecisions {
  return { ...decisions, autoMerge: { ...decisions.autoMerge, [index]: value } };
}

export function setNewRow(
  decisions: ImportReviewDecisions,
  index: number,
  value: boolean,
): ImportReviewDecisions {
  return { ...decisions, newRows: { ...decisions.newRows, [index]: value } };
}

/** Korisnikova kvačica "Ne znam još što je ovo" na jednom retku uvoza. */
export function setNeedsExplanation(
  decisions: ImportReviewDecisions,
  index: number,
  value: boolean,
): ImportReviewDecisions {
  return {
    ...decisions,
    needsExplanation: { ...(decisions.needsExplanation ?? {}), [index]: value },
  };
}

/** Korisnikova radnja "Vrati u knjige" na ranije obrisanom retku. */
export function setRestoreDeleted(
  decisions: ImportReviewDecisions,
  index: number,
  value: boolean,
): ImportReviewDecisions {
  return {
    ...decisions,
    restoreDeleted: { ...(decisions.restoreDeleted ?? {}), [index]: value },
  };
}

/** Jedini čitač te radnje — starim nacrtima bez polja vraća false. */
export function isRestoreDeleted(
  decisions: ImportReviewDecisions,
  index: number,
): boolean {
  return decisions.restoreDeleted?.[index] === true;
}

/** Redak čiji otisak pripada ranije obrisanom (ali živom u bazi) zapisu. */
export function isPreviouslyDeletedRow(row: ImportReviewRow): boolean {
  return (
    row.classification.kind === 'new' &&
    !row.classification.existsByFingerprint &&
    row.classification.deletedByFingerprint === true
  );
}

/** Jedini čitač oznake — starim nacrtima bez polja vraća false. */
export function isNeedsExplanation(
  decisions: ImportReviewDecisions,
  index: number,
): boolean {
  return decisions.needsExplanation?.[index] === true;
}

export function answerQuestion(
  decisions: ImportReviewDecisions,
  index: number,
  answer: QuestionAnswer | null,
): ImportReviewDecisions {
  return { ...decisions, questions: { ...decisions.questions, [index]: answer } };
}

/**
 * Set (or clear) a transfer decision for a row. When decision is non-null,
 * executor writes a single `type='transfer'` row for it and skips the row's
 * normal auto/question/new path. Passing null removes the override.
 */
export function setTransferDecision(
  decisions: ImportReviewDecisions,
  index: number,
  decision: TransferDecision | null,
): ImportReviewDecisions {
  return { ...decisions, transfers: { ...decisions.transfers, [index]: decision } };
}

export interface GatingSummary {
  readonly totalQuestions: number;
  readonly answeredQuestions: number;
  readonly unansweredQuestions: number;
  /** Transfer decisions that are enabled but have no target wallet picked. */
  readonly unresolvedTransfers: number;
  readonly canConfirm: boolean;
  readonly plannedMerges: number;
  readonly plannedNew: number;
  readonly plannedTransfers: number;
  readonly plannedSkipped: number; // fingerprint-hit newRows + user-unchecked
}

/**
 * Transfer decisions override the row's default path. This helper centralizes
 * the check so executor + summarize + UI agree.
 */
export function isTransferActive(
  decisions: ImportReviewDecisions,
  index: number,
): boolean {
  const t = decisions.transfers[index];
  return !!t && t.enabled === true;
}

/**
 * A transfer decision is "resolved" only if the user picked BOTH a real
 * counterpart wallet AND a direction. Empty string / null are the sentinels for
 * "not yet chosen" — enforced by summarize() gating and the executor pre-flight
 * check. Bez smjera nema tihe pretpostavke.
 */
export function isTransferResolved(d: TransferDecision | null | undefined): boolean {
  return (
    !!d &&
    d.enabled === true &&
    typeof d.targetIncomeSourceId === 'string' &&
    d.targetIncomeSourceId.length > 0 &&
    (d.direction === 'in' || d.direction === 'out')
  );
}

export function summarize(
  payload: ImportReviewPayload,
  decisions: ImportReviewDecisions,
): GatingSummary {
  let totalQuestions = 0;
  let answeredQuestions = 0;
  let plannedMerges = 0;
  let plannedNew = 0;
  let plannedTransfers = 0;
  let plannedSkipped = 0;
  let unresolvedTransfers = 0;

  for (const row of payload.rows) {
    // Transfer override wins for any row when enabled.
    if (isTransferActive(decisions, row.index)) {
      plannedTransfers += 1;
      if (!isTransferResolved(decisions.transfers[row.index])) {
        unresolvedTransfers += 1;
      }
      // If original classification was a 'question', still count it as answered
      // — the transfer choice IS the answer.
      if (row.classification.kind === 'question') {
        totalQuestions += 1;
        answeredQuestions += 1;
      }
      continue;
    }

    switch (row.classification.kind) {
      case 'auto_merge': {
        if (decisions.autoMerge[row.index]) plannedMerges += 1;
        else if (decisions.newRows[row.index] === true) plannedNew += 1;
        else plannedSkipped += 1;
        break;
      }
      case 'question': {
        totalQuestions += 1;
        const ans = decisions.questions[row.index];
        if (ans) {
          answeredQuestions += 1;
          if (ans.choice === 'merge') plannedMerges += 1;
          else plannedNew += 1;
        }
        break;
      }
      case 'new': {
        const offer = decisions.questions[row.index];
        if (row.classification.existsByFingerprint) {
          plannedSkipped += 1;
        } else if (row.classification.deletedByFingerprint === true) {
          // Ranije obrisano: ulazi u plan samo na izričito "Vrati u knjige".
          if (isRestoreDeleted(decisions, row.index)) plannedNew += 1;
          else plannedSkipped += 1;
        } else if (offer && offer.choice === 'merge') {
          // Prihvaćena ponuda spajanja (kartično kašnjenje) — jedan ishod.
          plannedMerges += 1;
        } else if (decisions.newRows[row.index]) {
          plannedNew += 1;
        } else {
          plannedSkipped += 1;
        }
        break;
      }
      case 'transfer': {
        // "Nije prijenos" vraća redak na običan prihod/rashod po predznaku.
        if (decisions.transfers[row.index]?.enabled === false) plannedNew += 1;
        else plannedSkipped += 1;
        break;
      }
    }
  }

  const unansweredQuestions = totalQuestions - answeredQuestions;
  return {
    totalQuestions,
    answeredQuestions,
    unansweredQuestions,
    unresolvedTransfers,
    canConfirm: unansweredQuestions === 0 && unresolvedTransfers === 0,
    plannedMerges,
    plannedNew,
    plannedTransfers,
    plannedSkipped,
  };
}

/**
 * Returns true when this new-row must be locked OFF (already anchored in DB
 * by fingerprint — Korak 2 duplikat-guard). Korak 4 executor will silently
 * skip such rows either way.
 */
export function isNewRowLocked(row: ImportReviewRow): boolean {
  return row.classification.kind === 'new' && row.classification.existsByFingerprint;
}
