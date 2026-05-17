export type MilestoneRevisionType = 'overrun' | 'saving' | 'scope_change' | 'correction';
export type MilestoneRevisionCoverage = 'increase_total' | 'transfer' | 'contingency';

export interface MilestoneBudgetRevision {
  id: string;
  milestone_id: string;
  project_id: string;
  user_id: string;
  previous_amount: number;
  new_amount: number;
  delta: number;
  reason: string;
  change_type: MilestoneRevisionType | null;
  coverage: MilestoneRevisionCoverage;
  linked_milestone_id: string | null;
  linked_revision_id: string | null;
  created_at: string;
}

export interface PendingRevisionInput {
  reason: string;
  change_type: MilestoneRevisionType | null;
  coverage: MilestoneRevisionCoverage;
  linked_milestone_id?: string | null;
  /**
   * Optional contract amendment (aneks ugovora) — only meaningful for scope_change.
   * When present, projects.contract_value is bumped by `amount` and a row
   * is inserted into project_contract_amendments for audit.
   */
  amendment?: {
    amount: number;
    note?: string | null;
  } | null;
}

export const REVISION_TYPE_META: Record<MilestoneRevisionType, { emoji: string; colorClass: string }> = {
  overrun:      { emoji: '🔴', colorClass: 'text-destructive border-destructive/40 bg-destructive/10' },
  saving:       { emoji: '🟢', colorClass: 'text-income border-income/40 bg-income/10' },
  scope_change: { emoji: '🟡', colorClass: 'text-warning border-warning/40 bg-warning/10' },
  correction:   { emoji: '🔵', colorClass: 'text-primary border-primary/40 bg-primary/10' },
};
