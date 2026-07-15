/**
 * projectViewState — sessionStorage backed pointer za trenutno otvoren projekt
 * i njegov aktivni tab. Živi IZVAN React drveta kako bi preživio remount
 * ProjectsPanel/ProjectFullScreenView komponenti pri povratku iz native
 * kamere (Android WebView može odbaciti state pri activity roundtripu).
 *
 * TTL ~10 min — zapisi stariji od toga ignoriraju se i brišu, kako restore
 * ne bi otimao navigaciju danima kasnije.
 *
 * NE koristi se kao izvor istine za bilo koju biznis logiku — čisto UI
 * pointer za pre-launch UX restore.
 */

const KEY = 'vmb.projectView';
const TTL_MS = 10 * 60 * 1000;

export interface ProjectViewState {
  projectId: string;
  tab: string | null;
  savedAt: number;
}

const safeSession = (): Storage | null => {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
};

export const projectViewState = {
  get(): ProjectViewState | null {
    const ss = safeSession();
    if (!ss) return null;
    let raw: string | null = null;
    try { raw = ss.getItem(KEY); } catch { return null; }
    if (!raw) return null;
    let parsed: ProjectViewState | null = null;
    try {
      parsed = JSON.parse(raw) as ProjectViewState;
    } catch {
      try { ss.removeItem(KEY); } catch { /* noop */ }
      return null;
    }
    if (!parsed || typeof parsed.projectId !== 'string' || typeof parsed.savedAt !== 'number') {
      try { ss.removeItem(KEY); } catch { /* noop */ }
      return null;
    }
    if (Date.now() - parsed.savedAt > TTL_MS) {
      try { ss.removeItem(KEY); } catch { /* noop */ }
      return null;
    }
    return parsed;
  },

  set(projectId: string, tab: string | null = null): void {
    const ss = safeSession();
    if (!ss) return;
    const value: ProjectViewState = { projectId, tab, savedAt: Date.now() };
    try { ss.setItem(KEY, JSON.stringify(value)); } catch { /* quota */ }
  },

  setTab(tab: string): void {
    const current = projectViewState.get();
    if (!current) return;
    projectViewState.set(current.projectId, tab);
  },

  clear(): void {
    const ss = safeSession();
    if (!ss) return;
    try { ss.removeItem(KEY); } catch { /* noop */ }
  },
};
