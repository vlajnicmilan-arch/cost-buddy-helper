// =============================================================
// Pure helper for project write guard decisions.
// Used by useProjectWriteGuard hook + vitest regression tests.
// =============================================================

import type { ProjectAccessLevel } from './projectAccess';
import type { ProjectRoleKey } from './projectRolePermissions';

export interface GuardDecisionInput {
  /** Explicit read-only override (already computed by caller). */
  isReadOnly?: boolean | null;
  /** Resolved access level (when caller doesn't pre-compute isReadOnly). */
  accessLevel?: ProjectAccessLevel | null;
  /**
   * Narrow exception: caller is performing an own-work-log write (worker/member).
   * When true, 'participant' is allowed. Owner-readonly (subscription downgrade)
   * stays blocked — that is a billing gate, independent of role.
   */
  allowOwnWorkLog?: boolean;
  /**
   * Korak D — uloga na projektu. Potrebna samo za `allowMemberProgress`, jer
   * accessLevel 'participant' ne razlikuje member / viewer / worker.
   */
  role?: ProjectRoleKey | null;
  /**
   * Korak D narrow exception: caller izvodi upis NAPRETKA (status faze, datumi,
   * dokumenti, checklist). Dopušteno samo ulozi 'member'. Novčani stupci ostaju
   * zabranjeni i na razini baze (trigger `guard_milestone_column_writes`).
   */
  allowMemberProgress?: boolean;
}

/**
 * Returns true when the caller is allowed to perform a write action.
 * Read-only states (owner_readonly, participant) and 'none' all block writes.
 *
 * 'participant' is NOT inherently read-only for every action — participants
 * may be allowed to perform some writes (e.g. work logs) via separate RBAC.
 * Pass `allowOwnWorkLog: true` to opt-in for that narrow exception.
 */
export function isProjectWriteAllowed(input: GuardDecisionInput): boolean {
  if (input.isReadOnly === true) return false;
  if (input.isReadOnly === false) return true;
  const lvl = input.accessLevel;
  if (!lvl) return false;
  if (lvl === 'owner_subscriber') return true;
  if (lvl === 'participant' && input.allowOwnWorkLog) return true;
  if (lvl === 'participant' && input.allowMemberProgress && input.role === 'member') return true;
  return false;
}

export function isProjectReadOnly(input: GuardDecisionInput): boolean {
  return !isProjectWriteAllowed(input);
}

