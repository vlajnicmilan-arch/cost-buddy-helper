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
} from './types';

export function buildInitialDecisions(payload: ImportReviewPayload): ImportReviewDecisions {
  const autoMerge: Record<number, boolean> = {};
  const questions: Record<number, QuestionAnswer | null> = {};
  const newRows: Record<number, boolean> = {};

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
    }
  }

  return { autoMerge, questions, newRows };
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

export interface GatingSummary {
  readonly totalQuestions: number;
  readonly answeredQuestions: number;
  readonly unansweredQuestions: number;
  readonly canConfirm: boolean;
  readonly plannedMerges: number;
  readonly plannedNew: number;
  readonly plannedSkipped: number; // fingerprint-hit newRows + user-unchecked
}

export function summarize(
  payload: ImportReviewPayload,
  decisions: ImportReviewDecisions,
): GatingSummary {
  let totalQuestions = 0;
  let answeredQuestions = 0;
  let plannedMerges = 0;
  let plannedNew = 0;
  let plannedSkipped = 0;

  for (const row of payload.rows) {
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
          // Fingerprint hit → always skipped, checkbox is disabled OFF.
          plannedSkipped += 1;
        } else if (decisions.newRows[row.index]) {
          plannedNew += 1;
        } else {
          plannedSkipped += 1;
        }
        break;
      }
    }
  }

  const unansweredQuestions = totalQuestions - answeredQuestions;
  return {
    totalQuestions,
    answeredQuestions,
    unansweredQuestions,
    canConfirm: unansweredQuestions === 0,
    plannedMerges,
    plannedNew,
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
