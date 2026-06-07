/**
 * Pure visibility resolver for project tabs. Behaviour must stay 1:1 with
 * the inline `canSeeTab` logic that used to live in `ProjectFullScreenView`.
 *
 * Rules (in order):
 *  1. Workers (restricted role) only see the work log.
 *  2. `workers` tab requires `canSeeWorkers`.
 *  3. `collaborators` tab requires `canSeeCollaborators`.
 *  4. `documents` is always visible to project members.
 *  5. `worklog` tab needs ≥1 worker AND (isManager OR explicit permission).
 *  6. Everything else: isManager OR explicit permission flag.
 */

export interface ProjectTabVisibilityInput {
  tabKey: string;
  isWorkerOnly: boolean;
  isManager: boolean;
  /** From `useProjectMemberPermissions().isTabVisible(tabKey)`. */
  isTabVisible: (tabKey: string) => boolean;
  canSeeWorkers: boolean;
  canSeeCollaborators: boolean;
  hasWorkers: boolean;
}

export function resolveProjectTabVisibility(input: ProjectTabVisibilityInput): boolean {
  const {
    tabKey, isWorkerOnly, isManager, isTabVisible,
    canSeeWorkers, canSeeCollaborators, hasWorkers,
  } = input;

  if (isWorkerOnly) return tabKey === 'worklog';
  if (tabKey === 'workers' && !canSeeWorkers) return false;
  if (tabKey === 'collaborators' && !canSeeCollaborators) return false;
  if (tabKey === 'documents') return true;
  if (tabKey === 'worklog') return hasWorkers && (isManager || isTabVisible('worklog'));
  return isManager || isTabVisible(tabKey);
}
