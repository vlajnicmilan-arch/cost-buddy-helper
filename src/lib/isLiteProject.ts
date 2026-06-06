/**
 * Lite project heuristic — used to decide DEFAULT view mode for existing projects
 * after the Lite UI rolls out. Newly created projects always default to 'lite';
 * legacy projects get auto-classified so power users don't lose tabs they relied on.
 *
 * Pure function. No DB calls. Caller passes counts.
 *
 * A project is considered "lite" when ALL of the following hold:
 *   - no contract_value set
 *   - total_budget is 0 or missing
 *   - ≤ 3 milestones
 *   - ≤ 1 member (creator only)
 *   - 0 documents
 *
 * Failing ANY of these returns false → 'full' view mode by default.
 */
export interface LiteProjectInput {
  contract_value?: number | null;
  total_budget?: number | null;
  milestonesCount: number;
  membersCount: number;
  documentsCount: number;
}

export function isLiteProject(input: LiteProjectInput): boolean {
  const cv = input.contract_value;
  if (cv != null && Number(cv) > 0) return false;

  const tb = Number(input.total_budget ?? 0);
  if (tb > 0) return false;

  if (input.milestonesCount > 3) return false;
  if (input.membersCount > 1) return false;
  if (input.documentsCount > 0) return false;

  return true;
}
