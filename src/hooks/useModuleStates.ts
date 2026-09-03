import { useMemo } from 'react';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import type { AppModule, ModuleState } from '@/lib/moduleVisibility';

/**
 * Centralni hook koji izlaže stanje modula za sve UI surface-e.
 *
 * Od ukidanja prekidača modula `enabled` više nije korisnička odluka — svi
 * moduli su uvijek "uključeni", a pristup određuje isključivo pretplata
 * (`tierUnlocked` iz `useFeatureAccess`). Business je iznimka samo utoliko
 * što njegovo `enabled` prati stvarno pravo, kako se poslovni način ne bi
 * nudio korisnicima bez modula.
 */
export function useModuleStates(): Record<AppModule, ModuleState> {
  const { hasAccess } = useFeatureAccess();

  return useMemo<Record<AppModule, ModuleState>>(() => {
    const businessUnlocked = hasAccess('business_module');
    return {
      core: { enabled: true, tierUnlocked: true },
      smjer: { enabled: true, tierUnlocked: hasAccess('unlimited_budgets') },
      krug: { enabled: true, tierUnlocked: hasAccess('krug') },
      projects: { enabled: true, tierUnlocked: hasAccess('projects') },
      business: { enabled: businessUnlocked, tierUnlocked: businessUnlocked },
    };
  }, [hasAccess]);
}
