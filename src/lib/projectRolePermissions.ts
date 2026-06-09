/**
 * F8–F10 Permissions Hardening — pure helper.
 *
 * Single source of truth for project role capabilities. Mirrors the SQL
 * policies installed in migration `f8-f10-permissions-hardening`. UI gates
 * MUST consume this; backend RLS is the second line of defense.
 *
 * Roles (project-scoped):
 *   - 'owner'   : projects.user_id === auth.uid()  (also seeded as manager row)
 *   - 'manager' : operativno upravlja projektom
 *   - 'member'  : moze unositi transakcije i vlastiti rad
 *   - 'worker'  : samo svoj rad / dnevnik
 *   - 'viewer'  : strogo read-only
 *
 * Naming convention: `can<Action>` returns boolean.
 */

export type ProjectRoleKey = 'owner' | 'manager' | 'member' | 'worker' | 'viewer';

export interface ProjectRoleContext {
  /** Effective role. NULL when user is not on the project. */
  role: ProjectRoleKey | null;
  /** Convenience flag — true when role === 'owner'. */
  isOwner: boolean;
}

export interface ProjectPermissions {
  // Members / invitations
  canInviteMembers: boolean;
  canRemoveMember: (targetRole: ProjectRoleKey) => boolean;
  canChangeMemberRole: (currentRole: ProjectRoleKey, nextRole: ProjectRoleKey) => boolean;
  /** Per-tab visibility delegation — owner only by product decision. */
  canManageMemberPermissions: boolean;

  // Workers
  canAddWorker: boolean;
  canEditWorker: boolean;
  canDeleteWorker: boolean;
  canSeeAllWorkers: boolean;

  // Work logs / entries
  canLogOwnWork: boolean;
  canEditOwnWorkLog: boolean;
  canEditOthersWorkLog: boolean;
  canDeleteOwnWorkLog: boolean;
  canDeleteOthersWorkLog: boolean;

  // Project financials
  canEditMilestones: boolean;
  canEditFunding: boolean;
  canEditCollaborators: boolean;
  canApprovePendingTransactions: boolean;
  canAddTransaction: boolean;
  canEditOthersTransaction: boolean;

  // Project lifecycle
  canCompleteOrReopenProject: boolean;
  canDeleteProject: boolean;
  canTransferOwnership: boolean;
}

const EMPTY: ProjectPermissions = {
  canInviteMembers: false,
  canRemoveMember: () => false,
  canChangeMemberRole: () => false,
  canManageMemberPermissions: false,
  canAddWorker: false,
  canEditWorker: false,
  canDeleteWorker: false,
  canSeeAllWorkers: false,
  canLogOwnWork: false,
  canEditOwnWorkLog: false,
  canEditOthersWorkLog: false,
  canDeleteOwnWorkLog: false,
  canDeleteOthersWorkLog: false,
  canEditMilestones: false,
  canEditFunding: false,
  canEditCollaborators: false,
  canApprovePendingTransactions: false,
  canAddTransaction: false,
  canEditOthersTransaction: false,
  canCompleteOrReopenProject: false,
  canDeleteProject: false,
  canTransferOwnership: false,
};

export function deriveProjectPermissions(ctx: ProjectRoleContext): ProjectPermissions {
  const { role, isOwner } = ctx;
  if (!role) return EMPTY;

  const isManager = isOwner || role === 'manager';
  const isViewer = role === 'viewer';
  const isWorker = role === 'worker';
  const canDoOwnWork = role === 'owner' || role === 'manager' || role === 'member' || role === 'worker';

  return {
    // ── Members / invitations ─────────────────────────────
    canInviteMembers: isManager,
    // Promoting/demoting a manager always requires owner.
    canRemoveMember: (targetRole) => {
      if (isOwner) return true;
      if (!isManager) return false;
      return targetRole !== 'manager';
    },
    canChangeMemberRole: (currentRole, nextRole) => {
      if (isOwner) return true;
      if (!isManager) return false;
      // Manager cannot touch a manager-row and cannot promote anyone to manager.
      return currentRole !== 'manager' && nextRole !== 'manager';
    },
    canManageMemberPermissions: isOwner, // owner-only by product decision

    // ── Workers ──────────────────────────────────────────
    canAddWorker: isManager,
    canEditWorker: isManager,
    canDeleteWorker: isManager,
    canSeeAllWorkers: isManager, // worker sees only own row (RLS-enforced)

    // ── Work logs / entries ──────────────────────────────
    canLogOwnWork: canDoOwnWork,
    canEditOwnWorkLog: canDoOwnWork,
    canEditOthersWorkLog: isManager,
    canDeleteOwnWorkLog: canDoOwnWork,
    canDeleteOthersWorkLog: isManager,

    // ── Project financials ───────────────────────────────
    canEditMilestones: isManager,
    canEditFunding: isManager,
    canEditCollaborators: isManager,
    canApprovePendingTransactions: isManager,
    // Viewer is strictly read-only — does NOT add transactions, not even pending.
    canAddTransaction: !isViewer && !isWorker,
    canEditOthersTransaction: isManager,

    // ── Project lifecycle ────────────────────────────────
    canCompleteOrReopenProject: isManager,
    canDeleteProject: isOwner,
    canTransferOwnership: isOwner,
  };
}

/**
 * Worker-only UI mode: user is restricted to the work-log tab.
 * Worker role + not manager (owner-with-manager-row should still see everything).
 */
export function isWorkerOnlyMode(ctx: ProjectRoleContext): boolean {
  if (ctx.isOwner) return false;
  return ctx.role === 'worker';
}
