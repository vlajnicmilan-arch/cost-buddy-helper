/**
 * Project role permissions — pure helper.
 *
 * Single source of truth for project role capabilities. Mirrors the SQL
 * policies installed in the F8–F10 realign migration. UI gates MUST consume
 * this; backend RLS is the second line of defense.
 *
 * Roles (matches UI exactly):
 *   - 'owner'  : projects.user_id === auth.uid()  — full power
 *   - 'member' : Član — može unositi vlastite transakcije i vlastiti rad
 *   - 'worker' : Radnik — samo svoj rad / dnevnik
 *   - 'viewer' : Promatrač — strogo read-only
 *
 * 'manager' više ne postoji kao zasebna rola (UI je nikad nije nudila).
 *
 * Naming convention: `can<Action>` returns boolean.
 */

export type ProjectRoleKey = 'owner' | 'member' | 'worker' | 'viewer' | 'investor';

export interface ProjectRoleContext {
  /** Effective role. NULL when user is not on the project. */
  role: ProjectRoleKey | null;
  /** Convenience flag — true when role === 'owner'. */
  isOwner: boolean;
}

export interface ProjectPermissions {
  // Members / invitations
  canInviteMembers: boolean;
  canRemoveMember: boolean;
  canChangeMemberRole: boolean;
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
  canRemoveMember: false,
  canChangeMemberRole: false,
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

  const isOwnerEffective = isOwner || role === 'owner';
  const isViewer = role === 'viewer';
  const isWorker = role === 'worker';
  const isMember = role === 'member';
  const canDoOwnWork = isOwnerEffective || isMember || isWorker;

  return {
    // ── Members / invitations — owner only ──────────────
    canInviteMembers: isOwnerEffective,
    canRemoveMember: isOwnerEffective,
    canChangeMemberRole: isOwnerEffective,
    canManageMemberPermissions: isOwnerEffective,

    // ── Workers — owner only ────────────────────────────
    canAddWorker: isOwnerEffective,
    canEditWorker: isOwnerEffective,
    canDeleteWorker: isOwnerEffective,
    canSeeAllWorkers: isOwnerEffective,

    // ── Work logs / entries ─────────────────────────────
    canLogOwnWork: canDoOwnWork,
    canEditOwnWorkLog: canDoOwnWork,
    canEditOthersWorkLog: isOwnerEffective,
    canDeleteOwnWorkLog: canDoOwnWork,
    canDeleteOthersWorkLog: isOwnerEffective,

    // ── Project financials ──────────────────────────────
    canEditMilestones: isOwnerEffective,
    canEditFunding: isOwnerEffective,
    canEditCollaborators: isOwnerEffective,
    canApprovePendingTransactions: isOwnerEffective,
    // Viewer i Worker ne unose transakcije.
    canAddTransaction: isOwnerEffective || isMember,
    canEditOthersTransaction: isOwnerEffective,

    // ── Project lifecycle ───────────────────────────────
    canCompleteOrReopenProject: isOwnerEffective,
    canDeleteProject: isOwnerEffective,
    canTransferOwnership: isOwnerEffective,
  };
}

/**
 * Worker-only UI mode: user is restricted to the work-log tab.
 */
export function isWorkerOnlyMode(ctx: ProjectRoleContext): boolean {
  if (ctx.isOwner || ctx.role === 'owner') return false;
  return ctx.role === 'worker';
}
