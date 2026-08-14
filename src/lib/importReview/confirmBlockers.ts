/**
 * POTVRDA GOVORI ŠTO JE KOČI.
 *
 * Čista logika za poruku koja se prikazuje kad korisnik klikne "Potvrdi uvoz"
 * dok `canConfirm=false`. NE mijenja branu — brana i dalje živi u
 * `summarize()`. Ovdje se samo prevodi stanje u riječi i pokazuje prvi
 * sporni redak.
 */
import type { GatingSummary } from './state';
import { isTransferActive, isTransferResolved } from './state';
import type { ImportReviewDecisions, ImportReviewPayload } from './types';

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** Poruke po uzroku, redoslijedom: prijenosi pa pitanja. */
export function buildBlockerMessages(
  summary: Pick<GatingSummary, 'unresolvedTransfers' | 'unansweredQuestions'>,
  t: Translate,
): string[] {
  const out: string[] = [];
  if (summary.unresolvedTransfers > 0) {
    out.push(t('importReview.blockers.transfers', { count: summary.unresolvedTransfers }));
  }
  if (summary.unansweredQuestions > 0) {
    out.push(t('importReview.blockers.questions', { count: summary.unansweredQuestions }));
  }
  return out;
}

/** Indeks prvog retka koji koči potvrdu (prijenos bez odredišta ili pitanje). */
export function firstBlockingRowIndex(
  payload: ImportReviewPayload,
  decisions: ImportReviewDecisions,
): number | null {
  for (const row of payload.rows) {
    if (isTransferActive(decisions, row.index)) {
      if (!isTransferResolved(decisions.transfers[row.index])) return row.index;
      continue;
    }
    if (row.classification.kind === 'question' && !decisions.questions[row.index]) {
      return row.index;
    }
  }
  return null;
}
