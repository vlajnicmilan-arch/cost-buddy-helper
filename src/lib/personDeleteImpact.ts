/**
 * Honest numbers behind the destructive actions on a PERSON (Ljudi).
 *
 * Pure presentation helpers — they change no deletion logic. The database
 * facts they encode (verified on the live schema):
 *   - `project_workers.worker_id -> workers` is ON DELETE SET NULL, so deleting
 *     a person keeps every engagement, hour and payout; only the grouping ends.
 *   - detaching one engagement is the same SET NULL, applied to a single row.
 */

export interface PersonEngagementFact {
  /** project_workers.id */
  engagementId: string;
  projectId: string | null;
  hours: number;
  earned: number;
  paid: number;
}

export interface PersonDeleteImpact {
  engagementCount: number;
  projectCount: number;
  hours: number;
  earned: number;
  paid: number;
  /** true when a Centar account link would be cut by the delete. */
  cutsAccountLink: boolean;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function summarizePersonDeleteImpact(
  engagements: readonly PersonEngagementFact[],
  options?: { linkedUserId?: string | null },
): PersonDeleteImpact {
  const projects = new Set<string>();
  let hours = 0;
  let earned = 0;
  let paid = 0;
  for (const e of engagements) {
    if (e.projectId) projects.add(e.projectId);
    hours += Number(e.hours) || 0;
    earned += Number(e.earned) || 0;
    paid += Number(e.paid) || 0;
  }
  return {
    engagementCount: engagements.length,
    projectCount: projects.size,
    hours: round2(hours),
    earned: round2(earned),
    paid: round2(paid),
    cutsAccountLink: !!options?.linkedUserId,
  };
}

/** Trimmed first/last name; invalid when the first name is empty. */
export interface PersonRenamePlan {
  valid: boolean;
  firstName: string;
  lastName: string;
  changed: boolean;
}

export function buildPersonRenamePlan(
  input: { firstName: string; lastName: string },
  current: { firstName: string; lastName: string },
): PersonRenamePlan {
  const firstName = (input.firstName ?? '').trim().replace(/\s+/g, ' ');
  const lastName = (input.lastName ?? '').trim().replace(/\s+/g, ' ');
  const changed =
    firstName !== (current.firstName ?? '').trim() || lastName !== (current.lastName ?? '').trim();
  return { valid: firstName.length > 0, firstName, lastName, changed };
}
