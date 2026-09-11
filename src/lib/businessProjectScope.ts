/**
 * Single source of truth for "which projects belong to the active business profile".
 *
 * Used by the business Projects screen and by the person-level hooks
 * (Ljudi / Suradnici) so that all three agree on the same criterion.
 */
export interface BusinessScopeProject {
  business_profile_id?: string | null;
  isOwner?: boolean;
  member_context?: string | null;
  member_business_profile_id?: string | null;
}

/** Owned project assigned to the profile, or a shared project joined under it. */
export const isProjectInBusinessScope = (
  project: BusinessScopeProject,
  profileId: string,
): boolean => {
  const isOwned = project.isOwner !== false;
  if (isOwned && project.business_profile_id === profileId) return true;
  return (
    project.isOwner === false &&
    project.member_context === 'business' &&
    project.member_business_profile_id === profileId
  );
};

/**
 * Personal mode (no active profile) keeps today's behaviour: nothing is filtered out.
 */
export const filterProjectsByBusinessScope = <T extends BusinessScopeProject>(
  projects: T[],
  profileId: string | null | undefined,
): T[] => (profileId ? projects.filter((p) => isProjectInBusinessScope(p, profileId)) : projects);
