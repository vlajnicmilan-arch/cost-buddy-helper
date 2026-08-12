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
import { buildTransferPair } from '@/lib/moneyDirection';
import { upsertTransferRules, type TransferRulesSupabaseClient, type UpsertRuleInput } from './transferRules';
import { shouldReconcile, isHistoricalBatch } from '@/lib/reconciliation/historyGate';
import { isCountedExpenseRow } from '@/lib/countedExpense';
import { isNeedsExplanation } from './state';


/**
 * Minimal supabase interface — must satisfy both the expense update/upsert
 * shapes AND the transfer-rules upsert shape (which uses no `ignoreDuplicates`).
 *
 * `rpc` is used for Faza 2 reconciliation preview
 * (`preview_source_balance_after_batch`).
 */
export interface ExecutorSupabaseClient extends TransferRulesSupabaseClient {
  from(table: string): any;
  rpc?: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
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

/**
 * Per-source reconciliation summary, one entry per unique source_id the batch
 * touched (payment_source custom UUID + transfer income_source_id). Populated
 * AFTER commit via `preview_source_balance_after_batch` RPC (pravilo C: živi
 * hybrid engine).
 *
 * `needsReconciliation = has_bank_row && |delta| > 0.01`.
 * If the RPC fails or the source has no bank row (e.g. only manual merges
 * touched it), `needsReconciliation` is false and the entry is informational.
 */
export interface ReconciliationSummaryEntry {
  readonly sourceId: string;
  readonly appBalance: number | null;
  readonly bankBalance: number | null;
  readonly delta: number | null;
  readonly hasBankRow: boolean;
  readonly needsReconciliation: boolean;
  readonly engineMode: 'hybrid';
  /** Trenutno sidro izvora (ISO) — null ako izvor nema sidro. */
  readonly anchorDate?: string | null;
  /** Timestamp zadnjeg retka uvezenog izvoda za ovaj izvor (ISO). */
  readonly batchLastAt?: string | null;
  /** Izvod završava na dan sidra ili prije → ne traži odluku. */
  readonly isHistorical?: boolean;
  /**
   * Odakle dolazi `bankBalance`:
   *  - 'bank_row'  — redak iz bank_accounts (Open Banking), uvijek ima prednost
   *  - 'statement' — završni saldo ispisan na samom izvodu (jedina istina bez OB)
   */
  readonly bankSource?: 'bank_row' | 'statement';
  readonly error?: string;
}

/** Saldo s papira za točno jedan izvor — koristi se samo bez bankovnog retka. */
export interface StatementBalanceFallback {
  readonly sourceId: string;
  readonly closingBalance: number;
  readonly statementDate: string | null;
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
  /** Planned outcomes already present before this attempt (idempotent retry). */
  readonly fulfilledExisting: number;
  /** All planned outcomes present after execution, regardless of when written. */
  readonly completedOutcomes: number;
  readonly durationMs: number;
  readonly errors: readonly string[];
  /** Faza 2 — post-commit reconciliation snapshot per unique source_id. */
  readonly reconciliationSummary: readonly ReconciliationSummaryEntry[];
}

export type ImportOutcomeFailureReason =
  | 'missing_transfer_target'
  | 'missing_transfer_direction'
  | 'invalid_transfer_pair'
  | 'database_error'
  | 'not_persisted';

export interface ImportOutcomeFailure {
  readonly rowIndex: number;
  readonly dateIso: string;
  readonly description: string;
  readonly amount: number;
  readonly type: string;
  readonly fingerprint: string;
  readonly reason: ImportOutcomeFailureReason;
  readonly detail?: string;
}

export class ImportExecutionIncompleteError extends Error {
  readonly expectedOutcomes: number;
  readonly actualOutcomes: number;
  readonly executionErrors: readonly string[];
  readonly failedOutcomes: readonly ImportOutcomeFailure[];

  constructor(
    expectedOutcomes: number,
    actualOutcomes: number,
    executionErrors: readonly string[],
    failedOutcomes: readonly ImportOutcomeFailure[],
  ) {
    super(`import_execution_incomplete:${actualOutcomes}/${expectedOutcomes}`);
    this.name = 'ImportExecutionIncompleteError';
    this.expectedOutcomes = expectedOutcomes;
    this.actualOutcomes = actualOutcomes;
    this.executionErrors = executionErrors;
    this.failedOutcomes = failedOutcomes;
  }
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

export interface PlannedWork {
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
      if (!on) {
        // "Razdvoji" na automatski uparenom retku: umjesto spajanja, redak se
        // uvozi kao novi. Bez te odluke redak se preskače (staro ponašanje).
        if (decisions.newRows[row.index] === true) { inserts.push({ rowIndex: row.index, tx }); continue; }
        skippedByUser += 1;
        continue;
      }
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
      // PONUDA SPAJANJA (kartično kašnjenje): korisnikov dodir upisan je kao
      // odgovor 'merge' na tom retku. Spojeni par = JEDAN ishod (merge), pa
      // idempotentna postkondicija ostaje netaknuta.
      const offer = decisions.questions[row.index];
      if (offer && offer.choice === 'merge') {
        const manual = payload.manualCandidates[offer.manualId];
        merges.push({ rowIndex: row.index, manualId: offer.manualId, tx, writeMerchant: !manual?.merchantName });
        continue;
      }
      const on = decisions.newRows[row.index] === true;
      if (!on) { skippedByUser += 1; continue; }
      inserts.push({ rowIndex: row.index, tx });
      continue;
    }

    // "Poništi pravilo" vraća redak u običan prihod/rashod po izvornom
    // predznaku; nije pošteno tiho ga izostaviti iz uvoza.
    if (row.classification.kind === 'transfer' && td?.enabled === false) {
      inserts.push({ rowIndex: row.index, tx });
      continue;
    }

    // Neodgovoreni transfer ostaje blokiran korisničkom odlukom.
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

  const allPlans = [...plan.merges, ...plan.inserts, ...plan.transfers];
  const existingBefore = await findPersistedFingerprints(
    input.supabase,
    input.userId,
    allPlans.map(item => item.tx.fingerprint),
  );
  const pendingMerges = plan.merges.filter(item => !existingBefore.has(item.tx.fingerprint));
  const pendingInserts = plan.inserts.filter(item => !existingBefore.has(item.tx.fingerprint));
  const pendingTransfers = plan.transfers.filter(item => !existingBefore.has(item.tx.fingerprint));

  // --- PRE-FLIGHT VALIDATION: no writes at all if any transfer decision is
  // missing a target wallet. This is the executor-side gate that matches the
  // UI's summarize() check — belt AND suspenders so a stale summary or a
  // programmatic caller cannot leak an income_source_id=NULL transfer.
  const badTransfers = pendingTransfers
    .map(t => {
      if (!t.decision.targetIncomeSourceId || t.decision.targetIncomeSourceId.length === 0) {
        return failureFromPlan(t, 'missing_transfer_target');
      }
      if (t.decision.direction !== 'in' && t.decision.direction !== 'out') {
        return failureFromPlan(t, 'missing_transfer_direction');
      }
      const pair = buildTransferPair({
        statementSource: t.tx.paymentSource,
        counterpartSourceId: t.decision.targetIncomeSourceId,
        direction: t.decision.direction,
      });
      if (!pair) return failureFromPlan(t, 'invalid_transfer_pair');
      return null;
    })
    .filter((x): x is ImportOutcomeFailure => x !== null);
  if (badTransfers.length > 0) {
    throw new ImportExecutionIncompleteError(
      plan.merges.length + plan.inserts.length + plan.transfers.length,
      existingBefore.size,
      badTransfers.map(item => `transfer:${item.rowIndex}:${item.reason}`),
      badTransfers,
    );

  }

  // --- STEP 0: upsert transfer rules that the user asked to remember. Runs
  // BEFORE inserts so a mid-flight retry keeps the rule and skips the row.
  let rulesSaved = 0;
  const rulesToSave: UpsertRuleInput[] = [];
  for (const t of pendingTransfers) {
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
        direction: t.decision.direction as 'in' | 'out',
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
  const writeErrorsByFingerprint = new Map<string, string>();

  // --- MERGE branch ---
  for (const m of pendingMerges) {
    const patch: Record<string, unknown> = {
      bank_transaction_id: m.tx.fingerprint,
      bank_match_status: 'confirmed',
      import_batch_id: batchId,
    };
    if (m.writeMerchant && m.tx.merchantName) {
      patch.merchant_name = m.tx.merchantName;
    }
    // Citat se DOPISUJE uz spojeni redak — korisnikov opis ostaje netaknut.
    if (m.tx.bankRawLine) {
      patch.bank_raw_line = m.tx.bankRawLine;
      patch.bank_raw_line_source = m.tx.bankRawLineSource;
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
        writeErrorsByFingerprint.set(m.tx.fingerprint, res.error.message);
        skippedMerged += 1;
        continue;
      }
      const affected = res.data?.length ?? 0;
      if (affected > 0) merged += 1;
      else skippedMerged += 1;
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      errors.push(`merge:${m.manualId}:${detail}`);
      writeErrorsByFingerprint.set(m.tx.fingerprint, detail);
      skippedMerged += 1;
    }
  }

  // --- INSERT branch (bulk upsert, ignoreDuplicates) ---
  let inserted = 0;
  let skippedDuplicate = 0;
  if (pendingInserts.length > 0) {
    const rows = pendingInserts.map(({ tx }) => ({
      user_id: input.userId,
      amount: tx.amount,
      description: tx.description,
      category: tx.category,
      type: tx.type,
      date: tx.dateIso,
      payment_source: tx.paymentSource,
      merchant_name: tx.merchantName,
      ai_extracted: false,
      category_origin: 'import',
      import_batch_id: batchId,
      business_profile_id: input.activeBusinessProfileId,
      bank_transaction_id: tx.fingerprint,
      bank_match_status: 'bank_only',
      // Bank timeline anchors — enable stable same-day ordering and per-row
      // "Banka: X €" chip in the wallet list.
      balance_after: tx.balanceAfter,
      bank_row_seq: tx.bankRowSeq,
      bank_raw_line: tx.bankRawLine ?? null,
      bank_raw_line_source: tx.bankRawLineSource ?? null,
      // OZNAKA "BEZ OBJAŠNJENJA" — samo ako je korisnik sam kvačio taj redak.
      needs_explanation: isNeedsExplanation(input.decisions, tx.index),
    }));
    try {
      const res = await input.supabase
        .from('expenses')
        .upsert(rows, { onConflict: 'user_id,bank_transaction_id', ignoreDuplicates: true })
        .select('id');
      if (res.error) {
        errors.push(`insert:${res.error.message}`);
        for (const item of pendingInserts) writeErrorsByFingerprint.set(item.tx.fingerprint, res.error.message);
      } else {
        inserted = res.data?.length ?? 0;
        skippedDuplicate = rows.length - inserted;
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      errors.push(`insert:${detail}`);
      for (const item of pendingInserts) writeErrorsByFingerprint.set(item.tx.fingerprint, detail);
    }
  }

  // --- TRANSFER branch (bulk upsert, ignoreDuplicates) ---
  let transfersCreated = 0;
  if (pendingTransfers.length > 0) {
    const rows = pendingTransfers.map(({ tx, decision }) => {
      // JEDINO mjesto koje slaže strane prijenosa — nikad ručno.
      const pair = buildTransferPair({
        statementSource: tx.paymentSource,
        counterpartSourceId: decision.targetIncomeSourceId,
        direction: decision.direction as 'in' | 'out',
      })!;
      return {
      user_id: input.userId,
      amount: tx.amount,
      // Description kept; helpful audit trail (bank line survives).
      description: tx.description,
      category: 'transfer',
      type: 'transfer',
      date: tx.dateIso,
      payment_source: pair.paymentSource,
      income_source_id: pair.incomeSourceId,
      merchant_name: tx.merchantName,
      ai_extracted: false,
      category_origin: 'rule',
      import_batch_id: batchId,
      business_profile_id: input.activeBusinessProfileId,
      bank_transaction_id: tx.fingerprint,
      bank_match_status: 'bank_only',
      balance_after: tx.balanceAfter,
      bank_row_seq: tx.bankRowSeq,
      bank_raw_line: tx.bankRawLine ?? null,
      bank_raw_line_source: tx.bankRawLineSource ?? null,
      needs_explanation: isNeedsExplanation(input.decisions, tx.index),
      };
    });
    try {
      const res = await input.supabase
        .from('expenses')
        .upsert(rows, { onConflict: 'user_id,bank_transaction_id', ignoreDuplicates: true })
        .select('id');
      if (res.error) {
        errors.push(`transfer:${res.error.message}`);
        for (const item of pendingTransfers) writeErrorsByFingerprint.set(item.tx.fingerprint, res.error.message);
      } else {
        transfersCreated = res.data?.length ?? 0;
        // Duplicates on retry counted as skippedDuplicate.
        skippedDuplicate += rows.length - transfersCreated;
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      errors.push(`transfer:${detail}`);
      for (const item of pendingTransfers) writeErrorsByFingerprint.set(item.tx.fingerprint, detail);
    }
  }

  // ŽELJEZNA POSTKONDICIJA: potvrđeni posao ne smije tiho završiti s manje
  // ishoda od odluka. Conflict, RLS ili bilo koja greška znače NEUSPJEH cijelog
  // pokušaja; pozivatelj tada čuva draft i ne zapisuje imported_statements.
  const expectedOutcomes = allPlans.length;
  const persistedAfter = await findPersistedFingerprints(
    input.supabase,
    input.userId,
    allPlans.map(item => item.tx.fingerprint),
  );
  const failedOutcomes = allPlans
    .filter(item => !persistedAfter.has(item.tx.fingerprint))
    .map(item => failureFromPlan(
      item,
      writeErrorsByFingerprint.has(item.tx.fingerprint) ? 'database_error' : 'not_persisted',
      writeErrorsByFingerprint.get(item.tx.fingerprint),
    ));
  const actualOutcomes = expectedOutcomes - failedOutcomes.length;
  if (failedOutcomes.length > 0) {
    throw new ImportExecutionIncompleteError(expectedOutcomes, actualOutcomes, errors, failedOutcomes);
  }

  // --- FAZA 2: post-commit reconciliation snapshot per touched source_id.
  // Uses live engine (hybrid) via preview_source_balance_after_batch RPC.
  // Only inserts+transfers introduce fresh bank_row_seq/balance_after, so we
  // enumerate source_ids from those two plans.
  const touchedSourceIds = collectTouchedSourceIds(plan);
  const reconciliationSummary = await buildReconciliationSummary(
    input.supabase,
    batchId,
    touchedSourceIds,
    resolveStatementFallback(input.payload),
  );

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
    fulfilledExisting: existingBefore.size,
    completedOutcomes: actualOutcomes,
    durationMs: now() - start,
    errors,
    reconciliationSummary,
  };
}

type OutcomePlan = MergePlan | InsertPlan | TransferPlan;

function failureFromPlan(
  item: OutcomePlan,
  reason: ImportOutcomeFailureReason,
  detail?: string,
): ImportOutcomeFailure {
  return {
    rowIndex: item.rowIndex,
    dateIso: item.tx.dateIso,
    description: item.tx.description,
    amount: item.tx.amount,
    type: item instanceof Object && 'decision' in item ? 'transfer' : item.tx.type,
    fingerprint: item.tx.fingerprint,
    reason,
    ...(detail ? { detail } : {}),
  };
}

async function findPersistedFingerprints(
  supabase: ExecutorSupabaseClient,
  userId: string,
  fingerprints: readonly string[],
): Promise<Set<string>> {
  const unique = [...new Set(fingerprints.filter(Boolean))];
  const found = new Set<string>();
  for (let offset = 0; offset < unique.length; offset += 200) {
    const chunk = unique.slice(offset, offset + 200);
    const res = await supabase
      .from('expenses')
      .select('bank_transaction_id,status')
      .eq('user_id', userId)
      .in('bank_transaction_id', chunk);
    if (res.error) throw new Error(`import_postcondition_query_failed:${res.error.message}`);
    for (const row of res.data ?? []) {
      if (!isCountedExpenseRow(row)) continue;
      const fingerprint = row?.bank_transaction_id;
      if (typeof fingerprint === 'string') found.add(fingerprint);
    }
  }
  return found;
}

// -----------------------------------------------------------------------------
// FAZA 2 helpers
// -----------------------------------------------------------------------------

/** Datum izvoda (YYYY-MM-DD) → kraj tog dana u ISO obliku; ISO ulaz ostaje. */
export function toStatementIso(raw: string | null): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T23:59:59.000Z`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Centi — izbjegava plutajući rep tipa 209.91999999999999. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

const CUSTOM_SOURCE_RE = /^custom:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Extract unique source UUIDs the batch touched (both sides of transfers). */
export function collectTouchedSourceIds(plan: PlannedWork): readonly string[] {
  const set = new Set<string>();
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    const m = CUSTOM_SOURCE_RE.exec(raw);
    if (m) set.add(m[1].toLowerCase());
  };
  for (const i of plan.inserts) add(i.tx.paymentSource);
  for (const t of plan.transfers) {
    add(t.tx.paymentSource);
    if (t.decision.targetIncomeSourceId) set.add(t.decision.targetIncomeSourceId.toLowerCase());
  }
  return [...set];
}

/**
 * Saldo s izvoda vrijedi samo za novčanik u koji se izvod uvozi (payload.sourceId).
 * Bez broja ili bez izvora — nema fallbacka (ponašanje kao dosad).
 */
export function resolveStatementFallback(
  payload: ImportReviewPayload,
): StatementBalanceFallback | null {
  const closing = payload.statementClosingBalance;
  if (typeof closing !== 'number' || !Number.isFinite(closing)) return null;
  if (!payload.sourceId) return null;
  return {
    sourceId: payload.sourceId.toLowerCase(),
    closingBalance: closing,
    statementDate: toStatementIso(payload.statementDate ?? null),
  };
}

async function buildReconciliationSummary(
  supabase: ExecutorSupabaseClient,
  batchId: string,
  sourceIds: readonly string[],
  statementFallback: StatementBalanceFallback | null = null,
): Promise<readonly ReconciliationSummaryEntry[]> {
  if (sourceIds.length === 0 || typeof supabase.rpc !== 'function') return [];
  const out: ReconciliationSummaryEntry[] = [];
  for (const sourceId of sourceIds) {
    try {
      const res = await supabase.rpc('preview_source_balance_after_batch', {
        p_source_id: sourceId,
        p_batch_id: batchId,
      });
      if (res.error) {
        out.push({
          sourceId,
          appBalance: null,
          bankBalance: null,
          delta: null,
          hasBankRow: false,
          needsReconciliation: false,
          engineMode: 'hybrid',
          error: res.error.message,
        });
        continue;
      }
      const data = (res.data ?? {}) as {
        app_balance?: number | null;
        bank_balance?: number | null;
        delta?: number | null;
        has_bank_row?: boolean;
        anchor_date?: string | null;
        batch_last_at?: string | null;
        is_historical?: boolean;
      };
      const app = data.app_balance ?? null;
      const bank = data.bank_balance ?? null;
      const delta = data.delta ?? null;
      const hasBankRow = data.has_bank_row === true;
      const gateInput = {
        hasBankRow,
        delta,
        anchorDate: data.anchor_date ?? null,
        batchLastAt: data.batch_last_at ?? null,
        isHistorical: typeof data.is_historical === 'boolean' ? data.is_historical : undefined,
      };
      // Bez bankovnog retka (izvor bez Open Bankinga) saldo s papira postaje
      // bankovna istina. S bankovnim retkom ponašanje je NEPROMIJENJENO.
      if (!hasBankRow && statementFallback && statementFallback.sourceId === sourceId.toLowerCase() && app !== null) {
        const stmtDelta = round2(statementFallback.closingBalance - app);
        const stmtGate = {
          hasBankRow: true,
          delta: stmtDelta,
          anchorDate: gateInput.anchorDate,
          batchLastAt: gateInput.batchLastAt ?? statementFallback.statementDate,
        };
        out.push({
          sourceId,
          appBalance: app,
          bankBalance: statementFallback.closingBalance,
          delta: stmtDelta,
          hasBankRow: false,
          needsReconciliation: shouldReconcile(stmtGate),
          engineMode: 'hybrid',
          anchorDate: stmtGate.anchorDate,
          batchLastAt: stmtGate.batchLastAt ?? null,
          isHistorical: isHistoricalBatch(stmtGate),
          bankSource: 'statement',
        });
        continue;
      }
      out.push({
        sourceId,
        appBalance: app,
        bankBalance: bank,
        delta,
        hasBankRow,
        // History gate: povijesni izvod (završava na dan sidra ili prije)
        // nikad ne traži odluku — razlika je tada očekivana.
        needsReconciliation: shouldReconcile(gateInput),
        engineMode: 'hybrid',
        anchorDate: gateInput.anchorDate,
        batchLastAt: gateInput.batchLastAt,
        isHistorical: isHistoricalBatch(gateInput),
        bankSource: 'bank_row',
      });

    } catch (e) {
      out.push({
        sourceId,
        appBalance: null,
        bankBalance: null,
        delta: null,
        hasBankRow: false,
        needsReconciliation: false,
        engineMode: 'hybrid',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return out;
}

