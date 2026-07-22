/**
 * Import Review — types shared between GlobalPDFImportHost (producer),
 * ImportReview page (consumer), reducer and sessionStorage draft.
 *
 * IMPORT_FROZEN policy: decisions are stored ONLY (no writes). Execution
 * of merge/insert is Korak 4.
 */

export type QuestionReason = 'merchant_mismatch' | 'no_merchant' | 'ambiguous';

export interface ManualCandidateInfo {
  readonly id: string;
  readonly date: string;
  readonly amount: number;
  readonly type: string;
  readonly merchantName?: string | null;
  readonly description?: string | null;
}

export type ClassificationKind =
  | { readonly kind: 'auto_merge'; readonly manualId: string }
  | { readonly kind: 'question'; readonly reason: QuestionReason; readonly candidateIds: readonly string[] }
  | { readonly kind: 'new'; readonly existsByFingerprint: boolean }
  /**
   * Rule engine matched this row against a learned transfer rule. Executor will
   * insert as `type='transfer'` with income_source_id = targetIncomeSourceId.
   * Balance updater/DB trigger handles both sides of the transfer.
   */
  | { readonly kind: 'transfer'; readonly targetIncomeSourceId: string; readonly ruleId: string | null };

export interface ImportReviewRow {
  readonly index: number;
  readonly date: string;
  readonly amount: number;
  readonly type: string;
  readonly merchantName?: string | null;
  readonly description?: string | null;
  readonly fingerprint?: string | null;
  readonly classification: ClassificationKind;
}

/**
 * Full data required by the Korak 4 executor to INSERT a row into expenses.
 * Kept serializable (no Date objects) so it survives sessionStorage.
 */
export interface SerializedImportedTx {
  readonly index: number;
  readonly dateIso: string;
  readonly amount: number;
  readonly type: string;
  readonly category: string;
  readonly description: string;
  readonly merchantName: string | null;
  readonly paymentSource: string; // canonical `custom:<uuid>` or 'cash'/'other'
  readonly balanceAfter: number | null;
  /**
   * Zero-based position of this row inside its source bank statement (parser
   * output order). Persisted onto `expenses.bank_row_seq` so the wallet list
   * can preserve bank order for same-day rows.
   */
  readonly bankRowSeq: number | null;
  readonly fingerprint: string;
}

/**
 * Wallet the user can pick as the DESTINATION of a transfer classified from a
 * bank row (goes into `expenses.income_source_id`). Excludes the source
 * wallet itself — you can't transfer to the same wallet you're transferring
 * from.
 */
export interface TransferTargetOption {
  readonly id: string;               // raw UUID (matches income_source_id)
  readonly name: string;
  readonly key: string;              // canonical resolvePaymentSourceKey (e.g. `custom:<uuid>`)
  readonly icon?: string | null;
}

export interface ImportReviewPayload {
  readonly jobId: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly createdAt: number;
  readonly rows: readonly ImportReviewRow[];
  readonly manualCandidates: Readonly<Record<string, ManualCandidateInfo>>;
  /** Full imported transaction data keyed by row.index (Korak 4 executor input). */
  readonly importedTransactions: readonly SerializedImportedTx[];
  /** Stable batch id — persisted so idempotent retry reuses it. */
  readonly batchId: string;
  /** Wallets the user can pick as transfer destinations. */
  readonly availableTargets: readonly TransferTargetOption[];
}

export type QuestionAnswer = { choice: 'merge'; manualId: string } | { choice: 'new' };

/**
 * Per-row transfer decision — either rule-suggested (row.classification.kind
 * === 'transfer') or user-flagged from a `new` row via "Označi kao prijenos".
 * If present AND enabled, executor writes a single `type='transfer'` row with
 * income_source_id = targetIncomeSourceId. rememberRule controls whether a new
 * rule (or refresh of existing) is upserted BEFORE the insert.
 */
export interface TransferDecision {
  readonly enabled: boolean;
  readonly targetIncomeSourceId: string;
  readonly rememberRule: boolean;
  /** Merchant key normalized at time of decision (used for rule upsert). */
  readonly merchantKey: string | null;
  /** Source wallet key normalized at time of decision (used for rule upsert). */
  readonly sourceWalletKey: string | null;
}

export interface ImportReviewDecisions {
  readonly autoMerge: Readonly<Record<number, boolean>>;
  readonly questions: Readonly<Record<number, QuestionAnswer | null>>;
  readonly newRows: Readonly<Record<number, boolean>>;
  readonly transfers: Readonly<Record<number, TransferDecision | null>>;
}

export interface ImportReviewDraft {
  readonly jobId: string;
  readonly savedAt: number;
  readonly decisions: ImportReviewDecisions;
  readonly scrollY?: number;
}

/** Draft TTL — pause/resume, fone poziv usred pregleda; 30 min. */
export const IMPORT_REVIEW_DRAFT_TTL_MS = 30 * 60 * 1000;

export const IMPORT_REVIEW_PAYLOAD_KEY = 'vmb-import-review-payload:v1';
export const IMPORT_REVIEW_DRAFT_KEY = 'vmb-import-review-draft:v1';
