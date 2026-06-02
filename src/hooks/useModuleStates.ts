import { useMemo } from 'react';
import { useAppState } from '@/contexts/AppStateContext';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import type { AppModule, ModuleState } from '@/lib/moduleVisibility';

/**
 * Centralni hook koji spaja toggle (AppState) + tier gate (useFeatureAccess)
 * i izlaže gotov `Record<AppModule, ModuleState>` za sve UI surface-e.
 *
 * NEMA side-effecta i NE čita localStorage direktno — sve ide preko
 * AppStateContext-a koji je već jedini izvor istine.
 */
export function useModuleStates(): Record<AppModule, ModuleState> {
  const { familyModeEnabled, projectsModuleEnabled, businessFeatureEnabled } = useAppState();
  const { hasAccess } = useFeatureAccess();

  return useMemo<Record<AppModule, ModuleState>>(() => ({
    core: { enabled: true, tierUnlocked: true },
    family: {
      enabled: familyModeEnabled,
      tierUnlocked: hasAccess('family_groups'),
    },
    projects: {
      enabled: projectsModuleEnabled,
      tierUnlocked: hasAccess('projects'),
    },
    business: {
      enabled: businessFeatureEnabled,
      tierUnlocked: hasAccess('business_module'),
    },
  }), [familyModeEnabled, projectsModuleEnabled, businessFeatureEnabled, hasAccess]);
}
