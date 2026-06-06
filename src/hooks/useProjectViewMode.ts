import { useCallback, useEffect, useState } from 'react';
import { LocalStorage } from './useLocalStorage';

export type ProjectViewMode = 'lite' | 'full';

const keyFor = (projectId: string) => `projectViewMode:${projectId}`;

/**
 * Per-project view-mode preference, persisted via LocalStorage helper
 * (works in both web and native via Capacitor Preferences).
 *
 * `defaultMode` is used until the user explicitly toggles.
 * The caller decides the default based on isLiteProject() heuristic
 * (new projects → 'lite', legacy projects → 'full').
 */
export const useProjectViewMode = (
  projectId: string | null | undefined,
  defaultMode: ProjectViewMode = 'lite'
) => {
  const [mode, setModeState] = useState<ProjectViewMode>(defaultMode);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setHydrated(true);
      return;
    }
    setHydrated(false);
    LocalStorage.get(keyFor(projectId))
      .then((v) => {
        if (cancelled) return;
        if (v === 'lite' || v === 'full') setModeState(v);
        else setModeState(defaultMode);
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) {
          setModeState(defaultMode);
          setHydrated(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, defaultMode]);

  const setMode = useCallback(
    async (next: ProjectViewMode) => {
      setModeState(next);
      if (projectId) {
        try {
          await LocalStorage.set(keyFor(projectId), next);
        } catch {
          // best-effort; UI state already updated
        }
      }
    },
    [projectId]
  );

  const toggle = useCallback(() => {
    setMode(mode === 'lite' ? 'full' : 'lite');
  }, [mode, setMode]);

  return { mode, setMode, toggle, hydrated };
};
