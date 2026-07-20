/**
 * Import Review — KORAK 4 executor.
 *
 * Turns the user's ImportReviewDecisions into actual writes against
 * `expenses`. Idempotent by construction:
 *
 *   - MERGE branch: UPDATE ... WHERE id = manualId AND bank_transaction_id IS NULL
 *     (race-guard). Second run finds 0 rows → counted as `skippedMerged`.
 *   - NEW branch:   bulk UPSERT with onConflict (user_id, bank_transaction_id)
 *     ignoreDuplicates = true. Second run: fingerprint already present → skipped.
 *
 * Merchant policy (Milan, KORAK 4 correction): manual/scanned merchant_name
 * always wins. `merchant_name = COALESCE(existing manual merchant, bank merchant)`.
 * Bank name is written ONLY if the manual row had no merchant_name.
 *
 * Amount / date / type / category / payment_source on MERGE branch are NEVER
 * touched — the manual row remains the source of truth for those.
 *
 * Rollback trail: every row (both inserted and merged) is tagged with the same
 * `import_batch_id`. Minimal ad-hoc rollback:
 *
 *   -- 1) un-do inserts from this batch
 *   DELETE FROM expenses
 *     WHERE user_id = :uid AND import_batch_id = :batch AND bank_match_status IN ('bank_only','imported');
 *   -- 2) un-merge (revert manual rows the executor touched)
 *   UPDATE expenses SET bank_transaction_id = NULL, bank_match_status = 'manual', import_batch_id = NULL
 *     WHERE user_id = :uid AND import_batch_id = :batch AND bank_match_status = 'confirmed';
 *
 * Pure enough: takes a supabase-like client through the interface. React-free.
 */

import type {
  ImportReviewDecisions,
  ImportReviewPayload,
  SerializedImportedTx,
} from './types';

/** Minimal supabase interface we depend on — makes the executor unit-testable. */
export interface ExecutorSupabaseClient {
  from(table: string): {
    update(patch: Record<string, unknown>): {
      eq(col: string, val: unknown): {
        eq(col: string, val: unknown): {
          is(col: string, val: null): {
            select(cols?: string): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
    upsert(
      rows: Record<string, unknown>[],
      opts: { onConflict: string; ignoreDuplicates: boolean },
    ): {
      select(cols?: string): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
}

export interface ExecutorInput {
  readonly supabase: ExecutorSupabaseClient;
  readonly userId: string;
  readonly activeBusinessProfileId: string | null;
  readonly payload: ImportReviewPayload;
  readonly decisions: ImportReviewDecisions;
  /** Optional override; defaults to payload.batchId (kept stable across retries). */
  readonly batchId?: string;
  readonly now?: () => number;
}

export interface ExecutorResult {
  readonly batchId: string;
  readonly merged: number;
  readonly inserted: number;
  /** Rows the user explicitly did NOT approve (unchecked auto/new, unanswered questions). */
  readonly skippedByUser: number;
  /** Rows blocked because fingerprint already exists in DB (new-row locked). */
  readonly skippedFingerprint: number;
  /** MERGE race-guard hit 0 rows (already merged in an earlier retry). */
  readonly skippedMerged: number;
  /** INSERT conflict on (user_id, bank_transaction_id) — already inserted earlier. */
  readonly skippedDuplicate: number;
  readonly durationMs: number;
  readonly errors: readonly string[];
}

type MergePlan = {
  readonly rowIndex: number;
  readonly manualId: string;
  readonly tx: SerializedImportedTx;
  readonly writeMerchant: boolean; // true iff existing manual had no merchant
};

type InsertPlan = {
  readonly rowIndex: number;
  readonly tx: SerializedImportedTx;
};

interface PlannedWork {
  readonly merges: readonly MergePlan[];
  readonly inserts: readonly InsertPlan[];
  readonly skippedByUser: number;
  readonly skippedFingerprint: number;
}

/**
 * Build the write plan from decisions. Pure — no I/O. Exposed for tests.
 */
export function planExecution(
  payload: ImportReviewPayload,
  decisions: ImportReviewDecisions,
): PlannedWork {
  const txByIndex = new Map<number, SerializedImportedTx>();
  for (const tx of payload.importedTransactions) txByIndex.set(tx.index, tx);

  const merges: MergePlan[] = [];
  const inserts: InsertPlan[] = [];
  let skippedByUser = 0;
  let skippedFingerprint = 0;

  for (const row of payload.rows) {
    const tx = txByIndex.get(row.index);
    if (!tx) continue;

    if (row.classification.kind === 'auto_merge') {
      const on = decisions.autoMerge[row.index] === true;
      if (!on) { skippedByUser += 1; continue; }
      const manualId = row.classification.manualId;
      const manual = payload.manualCandidates[manualId];
      const writeMerchant = !manual?.merchantName;
      merges.push({ rowIndex: row.index, manualId, tx, writeMerchant });
      continue;
    }

    if (row.classification.kind === 'question') {
      const ans = decisions.questions[row.index];
      if (!ans) { skippedByUser += 1; continue; }
      if (ans.choice === 'merge') {
        const manual = payload.manualCandidates[ans.manualId];
        const writeMerchant = !manual?.merchantName;
        merges.push({ rowIndex: row.index, manualId: ans.manualId, tx, writeMerchant });
      } else {
        inserts.push({ rowIndex: row.index, tx });
      }
      continue;
    }

    // kind === 'new'
    if (row.classification.existsByFingerprint) { skippedFingerprint += 1; continue; }
    const on = decisions.newRows[row.index] === true;
    if (!on) { skippedByUser += 1; continue; }
    inserts.push({ rowIndex: row.index, tx });
  }

  return { merges, inserts, skippedByUser, skippedFingerprint };
}

export async function executeDecisions(input: ExecutorInput): Promise<ExecutorResult> {
  const now = input.now ?? Date.now;
  const start = now();
  const batchId = input.batchId ?? input.payload.batchId;
  const plan = planExecution(input.payload, input.decisions);
  const errors: string[] = [];

  let merged = 0;
  let skippedMerged = 0;

  // --- MERGE branch ---
  for (const m of plan.merges) {
    const patch: Record<string, unknown> = {
      bank_transaction_id: m.tx.fingerprint,
      bank_match_status: 'confirmed',
      import_batch_id: batchId,
    };
    // Merchant policy: manual/scanned wins. Only write bank merchant when
    // the manual row had no merchant_name.
    if (m.writeMerchant && m.tx.merchantName) {
      patch.merchant_name = m.tx.merchantName;
    }
    try {
      const res = await input.supabase
        .from('expenses')
        .update(patch)
        .eq('id', m.manualId)
        .eq('user_id', input.userId)
        .is('bank_transaction_id', null)
        .select('id');
      if (res.error) {
        errors.push(`merge:${m.manualId}:${res.error.message}`);
        skippedMerged += 1;
        continue;
      }
      const affected = res.data?.length ?? 0;
      if (affected > 0) merged += 1;
      else skippedMerged += 1;
    } catch (e) {
      errors.push(`merge:${m.manualId}:${e instanceof Error ? e.message : String(e)}`);
      skippedMerged += 1;
    }
  }

  // --- INSERT branch (bulk upsert, ignoreDuplicates) ---
  let inserted = 0;
  let skippedDuplicate = 0;
  if (plan.inserts.length > 0) {
    const rows = plan.inserts.map(({ tx }) => ({
      user_id: input.userId,
      amount: tx.amount,
      description: tx.description,
      category: tx.category,
      type: tx.type,
      date: tx.dateIso,
      payment_source: tx.paymentSource,
      merchant_name: tx.merchantName,
      ai_extracted: false,
      import_batch_id: batchId,
      business_profile_id: input.activeBusinessProfileId,
      bank_transaction_id: tx.fingerprint,
      // Import from a bank statement = confirmation the money moved.
      bank_match_status: 'bank_only',
    }));
    try {
      const res = await input.supabase
        .from('expenses')
        .upsert(rows, { onConflict: 'user_id,bank_transaction_id', ignoreDuplicates: true })
        .select('id');
      if (res.error) {
        errors.push(`insert:${res.error.message}`);
      } else {
        inserted = res.data?.length ?? 0;
        skippedDuplicate = rows.length - inserted;
      }
    } catch (e) {
      errors.push(`insert:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    batchId,
    merged,
    inserted,
    skippedByUser: plan.skippedByUser,
    skippedFingerprint: plan.skippedFingerprint,
    skippedMerged,
    skippedDuplicate,
    durationMs: now() - start,
    errors,
  };
}
