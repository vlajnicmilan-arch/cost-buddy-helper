/**
 * Pure planning logic for linking ONE person (`workers`) to a Centar account.
 *
 * The link belongs to the PERSON, not to a single engagement: once an account
 * is attached, every engagement (`project_workers`) of that person carries it.
 *
 * Hard boundary: this link grants NO access to the app. Access still comes
 * exclusively from project members (`project_members`).
 */

export interface EngagementLink {
  id: string;
  projectId: string | null;
  /** Account currently attached to this engagement, if any. */
  userId: string | null;
  /** Optional; used to pick the invite carrier (newest engagement wins). */
  createdAt?: string | null;
  /** Optional; archived engagements never carry an invite. */
  archived?: boolean;
}

export interface SkippedProject {
  engagementId: string;
  projectId: string;
  /** Engagement on the same project that already holds this account. */
  existingEngagementId: string;
}

export interface PersonLinkPlan {
  /** Engagement ids that will receive the account. */
  toLink: string[];
  /** Already carrying the account — nothing to do. */
  alreadyLinked: string[];
  /** Blocked by the unique (project_id, user_id) rule. */
  skipped: SkippedProject[];
}

/**
 * Which engagements get the account, which are skipped because that account is
 * already used by ANOTHER worker on the same project. Never silently drops a
 * conflict — the caller must name the project to the user.
 */
export function planPersonLink(
  engagements: readonly EngagementLink[],
  targetUserId: string,
): PersonLinkPlan {
  const toLink: string[] = [];
  const alreadyLinked: string[] = [];
  const skipped: SkippedProject[] = [];

  for (const e of engagements) {
    if (e.userId === targetUserId) {
      alreadyLinked.push(e.id);
      continue;
    }
    const conflict = engagements.find(
      (o) => o.id !== e.id && o.projectId && o.projectId === e.projectId && o.userId === targetUserId,
    );
    if (conflict && e.projectId) {
      skipped.push({ engagementId: e.id, projectId: e.projectId, existingEngagementId: conflict.id });
      continue;
    }
    toLink.push(e.id);
  }

  return { toLink, alreadyLinked, skipped };
}

/** Unlinking clears the person AND every engagement that carried the account. */
export function planPersonUnlink(engagements: readonly EngagementLink[]): string[] {
  return engagements.filter((e) => e.userId !== null).map((e) => e.id);
}

/**
 * Engagement that carries an invitation — newest active one. The invite itself
 * is per project, but the resulting link propagates to the whole person.
 */
export function pickInviteCarrier(engagements: readonly EngagementLink[]): EngagementLink | null {
  const usable = engagements.filter((e) => !e.archived && !!e.projectId);
  if (usable.length === 0) return null;
  return usable.reduce((best, e) => {
    const a = best.createdAt ?? '';
    const b = e.createdAt ?? '';
    return b > a ? e : best;
  }, usable[0]);
}

/** Human-readable project names for the projects a link plan had to skip. */
export function skippedProjectNames(
  skipped: readonly SkippedProject[] | readonly string[],
  projectNames: Record<string, string>,
  fallback: string,
): string[] {
  return (skipped as readonly (SkippedProject | string)[]).map((s) => {
    const id = typeof s === 'string' ? s : s.projectId;
    return projectNames[id] || fallback;
  });
}
