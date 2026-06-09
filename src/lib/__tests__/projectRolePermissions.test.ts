import { describe, it, expect } from 'vitest';
import {
  deriveProjectPermissions,
  isWorkerOnlyMode,
  type ProjectRoleKey,
} from '@/lib/projectRolePermissions';

const ctx = (role: ProjectRoleKey | null, isOwner = false) => ({ role, isOwner });

describe('deriveProjectPermissions — owner', () => {
  const p = deriveProjectPermissions(ctx('owner', true));

  it('can do everything operational', () => {
    expect(p.canInviteMembers).toBe(true);
    expect(p.canAddWorker).toBe(true);
    expect(p.canEditWorker).toBe(true);
    expect(p.canDeleteWorker).toBe(true);
    expect(p.canEditMilestones).toBe(true);
    expect(p.canEditFunding).toBe(true);
    expect(p.canEditCollaborators).toBe(true);
    expect(p.canApprovePendingTransactions).toBe(true);
    expect(p.canAddTransaction).toBe(true);
    expect(p.canEditOthersTransaction).toBe(true);
    expect(p.canEditOthersWorkLog).toBe(true);
    expect(p.canCompleteOrReopenProject).toBe(true);
  });

  it('has destructive privileges', () => {
    expect(p.canDeleteProject).toBe(true);
    expect(p.canTransferOwnership).toBe(true);
    expect(p.canManageMemberPermissions).toBe(true);
  });

  it('can manage members', () => {
    expect(p.canRemoveMember).toBe(true);
    expect(p.canChangeMemberRole).toBe(true);
  });
});

describe('deriveProjectPermissions — member', () => {
  const p = deriveProjectPermissions(ctx('member', false));

  it('can input transactions and own work log', () => {
    expect(p.canAddTransaction).toBe(true);
    expect(p.canLogOwnWork).toBe(true);
    expect(p.canEditOwnWorkLog).toBe(true);
  });

  it('cannot manage people, workers, or financials', () => {
    expect(p.canInviteMembers).toBe(false);
    expect(p.canAddWorker).toBe(false);
    expect(p.canEditWorker).toBe(false);
    expect(p.canDeleteWorker).toBe(false);
    expect(p.canEditMilestones).toBe(false);
    expect(p.canEditFunding).toBe(false);
    expect(p.canEditCollaborators).toBe(false);
    expect(p.canApprovePendingTransactions).toBe(false);
    expect(p.canEditOthersWorkLog).toBe(false);
    expect(p.canEditOthersTransaction).toBe(false);
    expect(p.canDeleteProject).toBe(false);
    expect(p.canCompleteOrReopenProject).toBe(false);
    expect(p.canRemoveMember).toBe(false);
    expect(p.canChangeMemberRole).toBe(false);
  });
});

describe('deriveProjectPermissions — worker', () => {
  const p = deriveProjectPermissions(ctx('worker', false));

  it('can log own work only', () => {
    expect(p.canLogOwnWork).toBe(true);
    expect(p.canEditOwnWorkLog).toBe(true);
    expect(p.canDeleteOwnWorkLog).toBe(true);
  });

  it('cannot do anything else', () => {
    expect(p.canAddTransaction).toBe(false);
    expect(p.canAddWorker).toBe(false);
    expect(p.canEditWorker).toBe(false);
    expect(p.canEditMilestones).toBe(false);
    expect(p.canEditFunding).toBe(false);
    expect(p.canApprovePendingTransactions).toBe(false);
    expect(p.canEditOthersWorkLog).toBe(false);
    expect(p.canInviteMembers).toBe(false);
    expect(p.canSeeAllWorkers).toBe(false);
  });

  it('is in worker-only UI mode', () => {
    expect(isWorkerOnlyMode(ctx('worker', false))).toBe(true);
  });
});

describe('deriveProjectPermissions — viewer', () => {
  const p = deriveProjectPermissions(ctx('viewer', false));

  it('cannot write anything — strictly read-only', () => {
    expect(p.canAddTransaction).toBe(false);
    expect(p.canLogOwnWork).toBe(false);
    expect(p.canEditOwnWorkLog).toBe(false);
    expect(p.canDeleteOwnWorkLog).toBe(false);
    expect(p.canAddWorker).toBe(false);
    expect(p.canEditMilestones).toBe(false);
    expect(p.canEditFunding).toBe(false);
    expect(p.canInviteMembers).toBe(false);
    expect(p.canApprovePendingTransactions).toBe(false);
    expect(p.canCompleteOrReopenProject).toBe(false);
  });

  it('is NOT worker-only mode', () => {
    expect(isWorkerOnlyMode(ctx('viewer', false))).toBe(false);
  });
});

describe('deriveProjectPermissions — null role (non-member)', () => {
  const p = deriveProjectPermissions(ctx(null, false));

  it('has zero capabilities', () => {
    expect(p.canAddTransaction).toBe(false);
    expect(p.canLogOwnWork).toBe(false);
    expect(p.canAddWorker).toBe(false);
    expect(p.canInviteMembers).toBe(false);
    expect(p.canDeleteProject).toBe(false);
  });
});

describe('isOwner flag honoured even if role string differs', () => {
  // Defensive: if some caller passes role='member' but isOwner=true (e.g. legacy
  // hook before refactor finished), owner privileges still apply.
  const p = deriveProjectPermissions(ctx('member', true));
  it('keeps owner-only privileges via isOwner flag', () => {
    expect(p.canDeleteProject).toBe(true);
    expect(p.canTransferOwnership).toBe(true);
    expect(p.canManageMemberPermissions).toBe(true);
    expect(p.canRemoveMember).toBe(true);
    expect(p.canChangeMemberRole).toBe(true);
    expect(p.canEditMilestones).toBe(true);
  });
});
