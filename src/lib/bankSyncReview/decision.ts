/**
 * Red „Na pregled" — korisnikova odluka prolazi kroz jezgru `moneyLedgerPlan`
 * (redak je „pitanje"), a jezgrin ishod određuje što RPC
 * `bank_sync_review_decide` upisuje. Bez Reacta, bez mreže.
 */
import { planLedgerRow, type LedgerCandidate, type LedgerReason } from '@/lib/moneyLedgerPlan';
import { isIncomeType } from '@/lib/spendClassification';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { getBuildStamp } from '@/lib/buildStamp';

export type ReviewReason =
  | 'ambiguous'
  | 'uncertain'
  | 'rule_match_and_transfer_candidate'
  | 'candidate_already_used_in_run';

export interface ReviewPayload {
  amount: number;
  date: string;
  type: 'expense' | 'income';
  description: string | null;
  currency: string;
  payment_source: string;
  wallet_id: string;
  payment_source_card_id: string | null;
  business_profile_id: string | null;
  bank_raw_line: string;
}

export interface ReviewQueueItem {
  id: string;
  user_id: string;
  bank_account_id: string;
  stable_id: string;
  reason: ReviewReason;
  candidate_ids: string[];
  payload: ReviewPayload;
  created_at: string;
}

export interface ReviewCandidate {
  id: string;
  user_id: string;
  amount: number;
  date: string;
  description: string | null;
  payment_source: string | null;
}

export type ReviewChoice =
  | { kind: 'merge'; targetId: string }
  | { kind: 'new' }
  | { kind: 'transfer'; counterpartSourceId: string }
  | { kind: 'dismiss' };

export type RpcDecision = 'merge' | 'new' | 'transfer' | 'dismiss';

export interface PlannedReviewDecision {
  decision: RpcDecision;
  targetId: string | null;
  counterpartSourceId: string | null;
  ledgerReason: LedgerReason;
}

/** Jezgra odlučuje; kandidat drugog vlasnika za ovaj redak ne postoji. */
export function planReviewDecision(
  item: ReviewQueueItem,
  userId: string,
  candidates: readonly ReviewCandidate[],
  choice: ReviewChoice,
): PlannedReviewDecision {
  const ledgerCandidates: LedgerCandidate[] = candidates
    .filter((c) => item.candidate_ids.includes(c.id))
    .map((c) => ({ id: c.id, userId: c.user_id, kind: 'manual' }));
  const decision = planLedgerRow({
    rowIndex: 0,
    userId,
    amount: Number(item.payload.amount),
    dateIso: item.payload.date,
    direction: isIncomeType(item.payload) ? 'in' : 'out',
    walletId: item.payload.wallet_id,
    fingerprint: item.stable_id,
    classification: { kind: 'question' },
    candidates: ledgerCandidates,
    userChoice:
      choice.kind === 'merge'
        ? { questionChoice: 'merge', questionManualId: choice.targetId }
        : choice.kind === 'new'
          ? { questionChoice: 'new' }
          : choice.kind === 'transfer'
            ? { transferEnabled: true }
            : {},
  });

  if (decision.outcome === 'merge' && decision.candidateId && ledgerCandidates.some((c) => c.id === decision.candidateId)) {
    return { decision: 'merge', targetId: decision.candidateId, counterpartSourceId: null, ledgerReason: decision.reason };
  }
  if (decision.outcome === 'new') {
    return { decision: 'new', targetId: null, counterpartSourceId: null, ledgerReason: decision.reason };
  }
  if (decision.outcome === 'transfer' && choice.kind === 'transfer') {
    return {
      decision: 'transfer',
      targetId: null,
      counterpartSourceId: choice.counterpartSourceId,
      ledgerReason: decision.reason,
    };
  }
  if (choice.kind === 'dismiss') {
    return { decision: 'dismiss', targetId: null, counterpartSourceId: null, ledgerReason: decision.reason };
  }
  // Jezgra nije potvrdila izbor (npr. kandidat nije vlasnikov) — ništa se ne piše.
  throw new Error('target_not_candidate');
}

/** Kodovi koje RPC vraća i koje ekran prevodi. */
export const REVIEW_ERROR_CODES = [
  'target_not_candidate',
  'target_unavailable',
  'invalid_counterpart',
  'invalid_decision',
  'not_found',
  'already_booked',
] as const;
export type ReviewErrorCode = (typeof REVIEW_ERROR_CODES)[number] | 'unknown';

export function reviewErrorCode(err: unknown): ReviewErrorCode {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === '23505') return 'already_booked';
  const msg = String(e?.message ?? '');
  // Najdulji kod prvi, da kraći ne pojede dulji.
  const sorted = [...REVIEW_ERROR_CODES].sort((a, b) => b.length - a.length);
  return sorted.find((c) => msg.includes(c)) ?? 'unknown';
}

/** Trag odluke — bez iznosa i opisa. */
export function logReviewDecision(item: ReviewQueueItem, planned: PlannedReviewDecision, status: string): void {
  logDiagnostic({
    event: 'bank_sync_review_decision',
    severity: 'info',
    details: {
      reason: item.reason,
      decision: planned.decision,
      ledger_reason: planned.ledgerReason,
      stable_id: item.stable_id,
      status,
    },
  });
}

export function logReviewDecisionError(err: unknown, item: ReviewQueueItem, decision: RpcDecision): void {
  const e = err as { code?: string; message?: string } | null;
  logDiagnostic({
    event: 'bank_sync_review_decision_error',
    severity: 'error',
    details: {
      db_code: e?.code ?? null,
      db_message: String(e?.message ?? err),
      build: getBuildStamp(),
      reason: item.reason,
      decision,
      stable_id: item.stable_id,
    },
  });
}

/** Kategorija nije dobivena — odluka ide dalje s 'other'. */
export function logReviewCategoryError(err: unknown, item: ReviewQueueItem): void {
  const e = err as { code?: string; message?: string } | null;
  logDiagnostic({
    event: 'bank_sync_review_category_error',
    severity: 'warning',
    details: {
      db_code: e?.code ?? null,
      db_message: String(e?.message ?? err),
      build: getBuildStamp(),
      stable_id: item.stable_id,
    },
  });
}
