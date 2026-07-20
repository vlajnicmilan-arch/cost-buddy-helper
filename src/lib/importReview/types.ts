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
  readonly fingerprint: string;
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
}

export type QuestionAnswer = { choice: 'merge'; manualId: string } | { choice: 'new' };

export interface ImportReviewDecisions {
  readonly autoMerge: Readonly<Record<number, boolean>>;
  readonly questions: Readonly<Record<number, QuestionAnswer | null>>;
  readonly newRows: Readonly<Record<number, boolean>>;
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
