import { logDiagnostic } from '@/lib/diagnosticLogger';
import { getBuildStamp } from '@/lib/buildStamp';

interface PayoutActionErrorContext {
  payoutId: string | null;
  batchId: string | null;
  clientRequestId: string;
}

type DbError = { code?: string; message?: string } | null;

/**
 * Every server code raised by worker_confirm_payout_receipt (0026) and
 * worker_report_payout_not_received (0028) that has a dedicated message.
 */
export const WORKER_PAYOUT_ERROR_CODES = [
  'unauthenticated',
  'client_request_id_required',
  'exactly_one_target',
  'not_found',
  'not_payout_recipient',
  'client_request_id_reused',
  'payout_voided',
  'already_confirmed',
  'source_required',
  'source_not_found',
  'source_not_writable',
  'mixed_currency',
  'amount_mismatch',
  'amount_required',
  'amount_unknown',
  'already_reported',
  'note_too_long',
  'mixed_owner',
] as const;

export type WorkerPayoutErrorCode = (typeof WORKER_PAYOUT_ERROR_CODES)[number];

/** Longest match first so e.g. "source_not_found" never resolves to "not_found". */
const CODES_BY_LENGTH = [...WORKER_PAYOUT_ERROR_CODES].sort((a, b) => b.length - a.length);

export function resolveWorkerPayoutErrorCode(err: unknown): WorkerPayoutErrorCode | null {
  const e = err as DbError;
  if (e?.code === '23505') return 'already_confirmed';
  const msg = String(e?.message ?? '');
  return CODES_BY_LENGTH.find((c) => msg.includes(c)) ?? null;
}

/** Translated message key for any worker payout RPC failure. */
export function workerPayoutErrorKey(err: unknown): string {
  const code = resolveWorkerPayoutErrorCode(err);
  return code ? `attribution.errors.codes.${code}` : 'attribution.errors.generic';
}

/** @deprecated name kept for existing callers; same mapping as workerPayoutErrorKey. */
export const workerPayoutReceiptErrorKey = workerPayoutErrorKey;

function logPayoutError(event: string, err: unknown, ctx: PayoutActionErrorContext): void {
  const e = err as DbError;
  logDiagnostic({
    event,
    severity: 'error',
    details: {
      db_code: e?.code ?? null,
      db_message: String(e?.message ?? err),
      build: getBuildStamp(),
      payout_id: ctx.payoutId,
      batch_id: ctx.batchId,
      client_request_id: ctx.clientRequestId,
    },
  });
}

/** Literal code/message of a worker_confirm_payout_receipt failure + build stamp. */
export function logWorkerPayoutReceiptError(err: unknown, ctx: PayoutActionErrorContext): void {
  logPayoutError('worker_payout_receipt_error', err, ctx);
}

/** Literal code/message of a worker_report_payout_not_received failure + build stamp. */
export function logWorkerPayoutReportError(err: unknown, ctx: PayoutActionErrorContext): void {
  logPayoutError('worker_payout_report_error', err, ctx);
}
