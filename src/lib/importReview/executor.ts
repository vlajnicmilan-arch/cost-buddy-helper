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
 *   - TRANSFER branch: same bulk UPSERT path as NEW, but writes
 *     `type='transfer'`, `category='transfer'`, `income_source_id=<target>`.
 *     DB trigger `trg_expenses_recompute_source_balance` handles both sides
 *     of the wallet balance change — no second row is written.
 *
 * Merchant policy (Milan, KORAK 4 correction): manual/scanned merchant_name
 * always wins. `merchant_name = COALESCE(existing manual merchant, bank merchant)`.
 * Bank name is written ONLY if the manual row had no merchant_name.
 *
 * Amount / date / type / category / payment_source on MERGE branch are NEVER
 * touched — the manual row remains the source of truth for those.
 *
 * Rule upsert (transfers with rememberRule=true) runs BEFORE any expense
 * insert so a retry after a mid-flight failure is safe: the rule is saved
 * once and the same batchId reused for the retry.
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
  TransferDecision,
} from './types';
import { upsertTransferRules, type TransferRulesSupabaseClient, type UpsertRuleInput } from './transferRules';

/**
 * Minimal supabase interface — must satisfy both the expense update/upsert
 * shapes AND the transfer-rules upsert shape (which uses no `ignoreDuplicates`).
 */
export interface ExecutorSupabaseClient extends TransferRulesSupabaseClient {
  from(table: string): any;
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
  readonly transfersCreated: number;
  readonly rulesSaved: number;
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

type TransferPlan = {
  readonly rowIndex: number;
  readonly tx: SerializedImportedTx;
  readonly decision: TransferDecision;
};

interface PlannedWork {
  readonly merges: readonly MergePlan[];
  readonly inserts: readonly InsertPlan[];
  readonly transfers: readonly TransferPlan[];
  readonly skippedByUser: number;
  readonly skippedFingerprint: number;
}

/**
 * Build the write plan from decisions. Pure — no I/O. Exposed for tests.
 *
 * Precedence: an enabled TransferDecision overrides the row's default
 * classification path (auto/question/new). That's the same rule enforced in
 * summarize() so the summary matches what actually gets written.
 */
export function planExecution(
  payload: ImportReviewPayload,
  decisions: ImportReviewDecisions,
): PlannedWork {
  const txByIndex = new Map<number, SerializedImportedTx>();
  for (const tx of payload.importedTransactions) txByIndex.set(tx.index, tx);

  const merges: MergePlan[] = [];
  const inserts: InsertPlan[] = [];
  const transfers: TransferPlan[] = [];
  let skippedByUser = 0;
  let skippedFingerprint = 0;

  for (const row of payload.rows) {
    const tx = txByIndex.get(row.index);
    if (!tx) continue;

    // Transfer override wins.
    const td = decisions.transfers[row.index];
    if (td && td.enabled === true) {
      transfers.push({ rowIndex: row.index, tx, decision: td });
      continue;
    }

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

    if (row.classification.kind === 'new') {
      if (row.classification.existsByFingerprint) { skippedFingerprint += 1; continue; }
      const on = decisions.newRows[row.index] === true;
      if (!on) { skippedByUser += 1; continue; }
      inserts.push({ rowIndex: row.index, tx });
      continue;
    }

    // classification.kind === 'transfer' but user un-toggled → skipped.
    skippedByUser += 1;
  }

  return { merges, inserts, transfers, skippedByUser, skippedFingerprint };
}

export async function executeDecisions(input: ExecutorInput): Promise<ExecutorResult> {
  const now = input.now ?? Date.now;
  const start = now();
  const batchId = input.batchId ?? input.payload.batchId;
  const plan = planExecution(input.payload, input.decisions);
  const errors: string[] = [];

  // --- STEP 0: upsert transfer rules that the user asked to remember. Runs
  // BEFORE inserts so a mid-flight retry keeps the rule and skips the row.
  let rulesSaved = 0;
  const rulesToSave: UpsertRuleInput[] = [];
  for (const t of plan.transfers) {
    if (
      t.decision.rememberRule &&
      t.decision.merchantKey &&
      t.decision.sourceWalletKey &&
      t.decision.targetIncomeSourceId
    ) {
      rulesToSave.push({
        userId: input.userId,
        merchantKey: t.decision.merchantKey,
        sourceWalletKey: t.decision.sourceWalletKey,
        targetIncomeSourceId: t.decision.targetIncomeSourceId,
      });
    }
  }
  if (rulesToSave.length > 0) {
    const rr = await upsertTransferRules(input.supabase, rulesToSave);
    rulesSaved = rr.savedCount;
    for (const e of rr.errors) errors.push(`rule:${e}`);
  }

  let merged = 0;
  let skippedMerged = 0;

  // --- MERGE branch ---
  for (const m of plan.merges) {
    const patch: Record<string, unknown> = {
      bank_transaction_id: m.tx.fingerprint,
      bank_match_status: 'confirmed',
      import_batch_id: batchId,
    };
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

  // --- TRANSFER branch (bulk upsert, ignoreDuplicates) ---
  let transfersCreated = 0;
  if (plan.transfers.length > 0) {
    const rows = plan.transfers.map(({ tx, decision }) => ({
      user_id: input.userId,
      amount: tx.amount,
      // Description kept; helpful audit trail (bank line survives).
      description: tx.description,
      category: 'transfer',
      type: 'transfer',
      date: tx.dateIso,
      payment_source: tx.paymentSource,
      income_source_id: decision.targetIncomeSourceId,
      merchant_name: tx.merchantName,
      ai_extracted: false,
      import_batch_id: batchId,
      business_profile_id: input.activeBusinessProfileId,
      bank_transaction_id: tx.fingerprint,
      bank_match_status: 'bank_only',
    }));
    try {
      const res = await input.supabase
        .from('expenses')
        .upsert(rows, { onConflict: 'user_id,bank_transaction_id', ignoreDuplicates: true })
        .select('id');
      if (res.error) {
        errors.push(`transfer:${res.error.message}`);
      } else {
        transfersCreated = res.data?.length ?? 0;
        // Duplicates on retry counted as skippedDuplicate.
        skippedDuplicate += rows.length - transfersCreated;
      }
    } catch (e) {
      errors.push(`transfer:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    batchId,
    merged,
    inserted,
    transfersCreated,
    rulesSaved,
    skippedByUser: plan.skippedByUser,
    skippedFingerprint: plan.skippedFingerprint,
    skippedMerged,
    skippedDuplicate,
    durationMs: now() - start,
    errors,
  };
}
