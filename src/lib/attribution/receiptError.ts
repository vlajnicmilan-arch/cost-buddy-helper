import { logDiagnostic } from '@/lib/diagnosticLogger';
import { getBuildStamp } from '@/lib/buildStamp';

interface ReceiptErrorContext {
  payoutId: string | null;
  batchId: string | null;
  clientRequestId: string;
}

type DbError = { code?: string; message?: string } | null;

/** Literal code/message of a worker_confirm_payout_receipt failure + build stamp. */
export function logWorkerPayoutReceiptError(err: unknown, ctx: ReceiptErrorContext): void {
  const e = err as DbError;
  logDiagnostic({
    event: 'worker_payout_receipt_error',
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

/** Translated message key. Per-code texts arrive with task 3; until then known duplicates map to "already attributed". */
export function workerPayoutReceiptErrorKey(err: unknown): string {
  const e = err as DbError;
  if (e?.code === '23505' || e?.message === 'already_confirmed') {
    return 'attribution.errors.alreadyAttributed';
  }
  return 'attribution.errors.generic';
}
