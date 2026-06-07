/**
 * Pure mapping for legacy `initialTab` values that pre-date the unified
 * tab strip in `ProjectFullScreenView` (Wave 2). Behaviour must stay 1:1
 * with the inline logic that used to live in the component — tests in
 * `__tests__/projectTabAliases.test.ts` lock that contract.
 *
 * Identity-fallback for unknown keys preserves forward-compat: any new
 * tab key passes through untouched.
 */

export type TeamSubTab = 'members' | 'workers' | 'collaborators';

export interface ResolvedTabAlias {
  /** Effective tab key for the unified `<Tabs>` value. */
  tab: string;
  /** When the legacy key targeted a team sub-view, this is the sub-tab to open. */
  teamSubTab?: TeamSubTab;
}

const TEAM_KEYS: readonly TeamSubTab[] = ['members', 'workers', 'collaborators'];
const PHASES_KEYS = ['timeline', 'milestones'] as const;

export function resolveLegacyTabAlias(activeTab: string): ResolvedTabAlias {
  if ((TEAM_KEYS as readonly string[]).includes(activeTab)) {
    return { tab: 'team', teamSubTab: activeTab as TeamSubTab };
  }
  if ((PHASES_KEYS as readonly string[]).includes(activeTab)) {
    return { tab: 'phases' };
  }
  return { tab: activeTab };
}
