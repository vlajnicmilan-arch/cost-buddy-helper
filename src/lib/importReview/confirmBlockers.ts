/**
 * POTVRDA GOVORI ŠTO JE KOČI.
 *
 * Čista logika za poruku koja se prikazuje kad korisnik klikne "Potvrdi uvoz"
 * dok `canConfirm=false`. NE mijenja branu — brana i dalje živi u
 * `summarize()`. Ovdje se samo prevodi stanje u riječi i pokazuje prvi
 * sporni redak.
 */
import type { GatingSummary } from './state';
import { isTransferActive, isTransferResolved, isPairUnchosen } from './state';
import type { ImportReviewDecisions, ImportReviewPayload } from './types';

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** Poruke po uzroku, redoslijedom: parovi, prijenosi pa pitanja. */
export function buildBlockerMessages(
  summary: Pick<GatingSummary, 'unresolvedTransfers' | 'unansweredQuestions'> &
    Partial<Pick<GatingSummary, 'unchosenPairs'>>,
  t: Translate,
): string[] {
  const out: string[] = [];
  if ((summary.unchosenPairs ?? 0) > 0) {
    out.push(t('importReview.pair.blocked', { count: summary.unchosenPairs }));
  }
  if (summary.unresolvedTransfers > 0) {
    out.push(t('importReview.blockers.transfers', { count: summary.unresolvedTransfers }));
  }
  if (summary.unansweredQuestions > 0) {
    out.push(t('importReview.blockers.questions', { count: summary.unansweredQuestions }));
  }
  return out;
}

/** Indeks prvog retka koji koči potvrdu (neodabran par, prijenos bez odredišta ili pitanje). */
export function firstBlockingRowIndex(
  payload: ImportReviewPayload,
  decisions: ImportReviewDecisions,
): number | null {
  for (const row of payload.rows) {
    if (isPairUnchosen(row, decisions)) return row.index;
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
