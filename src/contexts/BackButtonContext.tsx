import { createContext, useContext, useRef, useCallback, useEffect, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isPublicRoute, isRootAppRoute } from '@/lib/publicRoutes';
import { isNativeFlowActive } from '@/lib/nativeFlowGuard';
import { logDiagnostic } from '@/lib/diagnosticLogger';

/**
 * Global Back Button Manager — jedinstveni LIFO stack za sve slojeve UI-a.
 *
 * Semantika (svaki back = TOČNO jedan logički korak):
 *   1. Public rute (/auth, /setup, /install, /, …) → NE presreći ništa.
 *   2. Kamera / native guard aktivan → apsorbiraj popstate (re-push).
 *   3. Otvoren handler s najvećim prioritetom → zovi njegov onClose (LIFO uz
 *      priority tiebreak). Ovdje spadaju: overlay, dijalog, sheet, inline
 *      detail, fullscreen view, tab-back — sve u ISTOM stacku.
 *   4. Nema handlera i nije root app ruta → navigate('/home') (jedan korak).
 *   5. Nema handlera i JE root ruta:
 *        - Native (Android) → App.minimizeApp() (Android standard).
 *        - Web/PWA → re-push guard state (spriječi accidental exit).
 *
 * Handler pravila:
 *   - Jedini gurač history entryja je OVAJ context. Nijedna komponenta ne
 *     smije imati vlastiti pushState/popstate — sve ide kroz useBackButton.
 *   - isNativeFlowActive + VISIBILITY_GRACE_MS guard pokriva SVE handlere;
 *     dok je aktivan, nijedan handler se ne izvršava (kamera saga netaknuta).
 */

/** Prioriteti (viši = zatvara se prvi). */
export const BACK_PRIORITY = {
  /** Sistemski overlay / kritični guard (rezervirano). */
  OVERLAY: 1000,
  /** Modalni dijalog, sheet, drawer, alert-dialog, picker. */
  DIALOG: 800,
  /** Inline detail ekran unutar tab-a (npr. DecisionDetail). */
  DETAIL: 600,
  /** Fullscreen view (ProjectFullScreenView, BudgetFullScreenView, …). */
  FULLSCREEN: 400,
  /** Tab-back unutar fullscreen view-a. */
  TAB: 200,
  /** Root/legacy — najniži prioritet. */
  ROOT: 0,
} as const;

type BackHandler = {
  id: string;
  isOpen: boolean;
  onClose: () => void;
  priority: number;
  openedAt: number;
};

type BackButtonContextType = {
  register: (id: string, isOpen: boolean, onClose: () => void, priority?: number) => void;
  unregister: (id: string) => void;
  /** Trenutni broj registriranih otvorenih handlera (dijagnostika). */
  getStackDepth: () => number;
};

const BackButtonContext = createContext<BackButtonContextType | null>(null);

/**
 * Detekcija Android/native shell-a. Isti pattern koji koristi useDeepLinks.
 * Web/PWA fallback ostavlja postojeće ponašanje (re-push).
 */
const isNativePlatform = (): boolean => {
  try {
    return !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
};

const tryMinimizeApp = () => {
  // Best-effort — nikad ne bacamo iznimke iz popstate handlera.
  import('@capacitor/app')
    .then((mod) => {
      const app: any = (mod as any).App;
      if (app && typeof app.minimizeApp === 'function') {
        app.minimizeApp().catch?.(() => { /* ignore */ });
      }
    })
    .catch(() => { /* ignore */ });
};

export function BackButtonProvider({ children }: { children: ReactNode }) {
  const handlersRef = useRef<Map<string, BackHandler>>(new Map());
  const navigate = useNavigate();
  const locationRef = useRef<string>('/');
  const initialStatePushedRef = useRef(false);
  const lastForegroundAtRef = useRef<number>(0);
  const VISIBILITY_GRACE_MS = 2500;

  const location = useLocation();
  useEffect(() => {
    locationRef.current = location.pathname;
    if (import.meta.env.DEV) {
      console.log('[BackButton] route changed:', location.pathname, 'public:', isPublicRoute(location.pathname));
    }
  }, [location.pathname]);

  const register = useCallback((id: string, isOpen: boolean, onClose: () => void, priority = 0) => {
    const existing = handlersRef.current.get(id);
    const wasOpen = existing?.isOpen ?? false;

    // Nikad ne guraj history entry na public rutama — zarobilo bi korisnika.
    if (isOpen && !wasOpen && !isPublicRoute(locationRef.current)) {
      window.history.pushState({ backButtonId: id }, '');
    }

    handlersRef.current.set(id, {
      id,
      isOpen,
      onClose,
      priority,
      openedAt: isOpen && !wasOpen ? Date.now() : (existing?.openedAt ?? 0),
    });
  }, []);

  const unregister = useCallback((id: string) => {
    handlersRef.current.delete(id);
  }, []);

  const getStackDepth = useCallback(() => {
    let n = 0;
    handlersRef.current.forEach((h) => { if (h.isOpen) n++; });
    return n;
  }, []);

  const handlePopState = useCallback(() => {
    const currentPath = locationRef.current;

    // Public rute → potpuno prepusti browseru.
    if (isPublicRoute(currentPath)) {
      if (import.meta.env.DEV) {
        console.log('[BackButton] popstate on public route — ignored:', currentPath);
      }
      return;
    }

    const openHandlers = Array.from(handlersRef.current.values())
      .filter(h => h.isOpen)
      .sort((a, b) => b.priority - a.priority || b.openedAt - a.openedAt);

    const stackDepthBefore = openHandlers.length;
    const sinceForeground = Date.now() - lastForegroundAtRef.current;
    const guarded = isNativeFlowActive();
    try {
      logDiagnostic({
        event: 'backctx_popstate',
        details: {
          guarded,
          stackDepthBefore,
          sinceForegroundMs: lastForegroundAtRef.current > 0 ? sinceForeground : -1,
          topHandlerId: openHandlers[0]?.id ?? null,
          topHandlerPriority: openHandlers[0]?.priority ?? null,
          route: currentPath,
        },
      });
    } catch { /* ignore */ }

    if (guarded || (lastForegroundAtRef.current > 0 && sinceForeground < VISIBILITY_GRACE_MS)) {
      window.history.pushState(null, '');
      return;
    }

    if (openHandlers.length > 0) {
      const handler = openHandlers[0];
      // Ne mijenjamo isOpen ovdje — dijalozi koji intencionalno ignoriraju back
      // (native flow) ne smiju biti flagirani kao zatvoreni prije nego što se
      // zaista zatvore. Consumer je odgovoran za state.
      try {
        logDiagnostic({
          event: 'backctx_handler_consumed',
          details: { id: handler.id, priority: handler.priority, stackDepthBefore },
        });
      } catch { /* ignore */ }
      handler.onClose();
      return;
    }

    // Nema handlera — page-level back.
    if (!isRootAppRoute(currentPath)) {
      navigate('/home', { replace: false });
      return;
    }

    // Root app ruta bez handlera → Android minimize, web re-push.
    if (isNativePlatform()) {
      try {
        logDiagnostic({ event: 'backctx_minimize', details: { route: currentPath } });
      } catch { /* ignore */ }
      tryMinimizeApp();
      // Sigurnosno vratimo guard entry ako minimize ne uspije, da back
      // ne pobjegne iz web-view scope-a.
      window.history.pushState(null, '');
      return;
    }
    window.history.pushState(null, '');
  }, [navigate]);

  useEffect(() => {
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [handlePopState]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        lastForegroundAtRef.current = Date.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    if (
      !initialStatePushedRef.current &&
      !isPublicRoute(location.pathname) &&
      isRootAppRoute(location.pathname)
    ) {
      window.history.pushState(null, '');
      initialStatePushedRef.current = true;
    }
  }, [location.pathname]);

  return (
    <BackButtonContext.Provider value={{ register, unregister, getStackDepth }}>
      {children}
    </BackButtonContext.Provider>
  );
}

export function useBackButtonContext() {
  const ctx = useContext(BackButtonContext);
  if (!ctx) throw new Error('useBackButtonContext must be used within BackButtonProvider');
  return ctx;
}
