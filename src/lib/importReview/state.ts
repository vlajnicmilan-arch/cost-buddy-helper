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
        break;
      case 'question':
        // No default — blocking gate.
        questions[row.index] = null;
        break;
      case 'new':
        // Default ON, ali OFF (i disabled) kad postoji fingerprint hit.
        newRows[row.index] = !row.classification.existsByFingerprint;
        break;
      case 'transfer':
        // Rule already matched → default ON, rememberRule=false (rule postoji).
        transfers[row.index] = {
          enabled: true,
          targetIncomeSourceId: row.classification.targetIncomeSourceId,
          rememberRule: false,
          merchantKey: null,
          sourceWalletKey: null,
        };
        break;
    }
  }

  return { autoMerge, questions, newRows, transfers };
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

export function answerQuestion(
  decisions: ImportReviewDecisions,
  index: number,
  answer: QuestionAnswer,
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
 * A transfer decision is "resolved" only if the user picked a real destination
 * wallet. Empty string is the sentinel for "not yet chosen" — enforced by both
 * summarize() gating and the executor pre-flight check.
 */
export function isTransferResolved(d: TransferDecision | null | undefined): boolean {
  return !!d && d.enabled === true && typeof d.targetIncomeSourceId === 'string' && d.targetIncomeSourceId.length > 0;
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
        if (row.classification.existsByFingerprint) {
          plannedSkipped += 1;
        } else if (decisions.newRows[row.index]) {
          plannedNew += 1;
        } else {
          plannedSkipped += 1;
        }
        break;
      }
      case 'transfer': {
        // Rule-suggested but user disabled it (enabled === false) → skipped.
        plannedSkipped += 1;
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
