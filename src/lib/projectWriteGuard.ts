// =============================================================
// Pure helper for project write guard decisions.
// Used by useProjectWriteGuard hook + vitest regression tests.
// =============================================================

import type { ProjectAccessLevel } from './projectAccess';

export interface GuardDecisionInput {
  /** Explicit read-only override (already computed by caller). */
  isReadOnly?: boolean | null;
  /** Resolved access level (when caller doesn't pre-compute isReadOnly). */
  accessLevel?: ProjectAccessLevel | null;
}

/**
 * Returns true when the caller is allowed to perform a write action.
 * Read-only states (owner_readonly, participant) and 'none' all block writes.
 *
 * Note: 'participant' is NOT inherently read-only for every action — participants
 * may be allowed to perform some writes (e.g. work logs) via separate RBAC.
 * That nuance is handled by callers passing isReadOnly explicitly when needed.
 * This pure helper only encodes the strict "owner_readonly OR explicit override"
 * gate, which matches what ProjectFullScreenView already computes.
 */
export function isProjectWriteAllowed(input: GuardDecisionInput): boolean {
  if (input.isReadOnly === true) return false;
  if (input.isReadOnly === false) return true;
  const lvl = input.accessLevel;
  if (!lvl) return false;
  return lvl === 'owner_subscriber';
}

export function isProjectReadOnly(input: GuardDecisionInput): boolean {
  return !isProjectWriteAllowed(input);
}
