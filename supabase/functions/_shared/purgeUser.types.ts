// Shared types for the canonical user purge engine.
// See docs/HARD_DELETE.md for the foundation contract.

export type PurgeSourceTag = "cron_grace" | "admin_hard_delete";

export type PurgeBlockedReason = "krug_multi_member" | "paid_records_present";

export interface PurgePolicy {
  sourceTag: PurgeSourceTag;
  /** Allow deleting krugs that still have other members. Default false. */
  allowKrugDestruction?: boolean;
  /** Allow deleting lifetime_purchases / paid records. Default false. */
  deletePaidRecords?: boolean;
  /** Cancel active Stripe subscriptions for this email. Default true. */
  cancelStripeSubscription?: boolean;
}

export interface PurgeInput {
  userId: string;
  userEmail: string | null;
  policy: PurgePolicy;
}

export interface ResidualScanReport {
  /** Map of table -> row count for any non-zero residuals after purge. */
  byUserId: Record<string, number>;
  byEmail: Record<string, number>;
  dependent: Record<string, number>;
  total: number;
}

export interface PurgeResult {
  ok: boolean;
  blockedBy?: PurgeBlockedReason;
  blockedDetails?: Record<string, unknown>;
  /** Per-table delete counts (best-effort; some drivers don't return counts). */
  tablesPurged: Record<string, number>;
  /** Per-bucket file removal counts. */
  storagePurged: Record<string, number>;
  invitationsByEmail: Record<string, number>;
  stripeSubscriptionCancelled: boolean;
  authDeleted: boolean;
  residualScan: ResidualScanReport;
  errors: Array<{ phase: string; target: string; message: string }>;
}
