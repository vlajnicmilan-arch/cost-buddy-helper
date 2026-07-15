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
  /** Tab-back unutar fullscreen view-a — iznad FULLSCREEN da se tab vrati prije zatvaranja view-a. */
  TAB: 500,
  /** Fullscreen view (ProjectFullScreenView, BudgetFullScreenView, …). */
  FULLSCREEN: 400,
  /** Root/legacy — najniži prioritet. */
  ROOT: 0,
} as const;

type BackHandler = {
  id: string;
  isOpen: boolean;
  onClose: () => void;
  priority: number;
  openedAt: number;
  label?: string;
};

type BackButtonContextType = {
  register: (id: string, isOpen: boolean, onClose: () => void, priority?: number, label?: string) => void;
  unregister: (id: string) => void;
  /** Trenutni broj registriranih otvorenih handlera (dijagnostika). */
  getStackDepth: () => number;
};

const BackButtonContext = createContext<BackButtonContextType | null>(null);
const ROOT_HANDLER_ID = 'back-root';

const handlerLayer = (h: BackHandler) => ({
  id: h.id,
  priority: h.priority,
  ...(h.label ? { label: h.label } : {}),
});

const sortOpenHandlers = (handlers: Iterable<BackHandler>) => Array.from(handlers)
  .filter(h => h.isOpen)
  .sort((a, b) => b.priority - a.priority || b.openedAt - a.openedAt);

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

const requestExitConfirm = () => {
  try {
    window.dispatchEvent(new CustomEvent('vmb:request-exit-confirm'));
  } catch { /* ignore */ }
};

export function BackButtonProvider({ children }: { children: ReactNode }) {
  const handlersRef = useRef<Map<string, BackHandler>>(new Map());
  const navigate = useNavigate();
  const locationRef = useRef<string>('/');
  const initialStatePushedRef = useRef(false);
  const lastForegroundAtRef = useRef<number>(0);
  const VISIBILITY_GRACE_MS = 2500;

  const getOpenHandlers = useCallback(() => sortOpenHandlers(handlersRef.current.values()), []);

  const getOpenLayers = useCallback(() => getOpenHandlers().map(handlerLayer), [getOpenHandlers]);

  const consumeRootBack = useCallback(() => {
    const currentPath = locationRef.current;

    if (!isRootAppRoute(currentPath)) {
      navigate('/home', { replace: false });
      return;
    }

    if (isNativePlatform()) {
      try {
        logDiagnostic({ event: 'backctx_exit_confirm', details: { route: currentPath } });
      } catch { /* ignore */ }
      requestExitConfirm();
      window.history.pushState(null, '');
      return;
    }

    window.history.pushState(null, '');
  }, [navigate]);

  const location = useLocation();
  useEffect(() => {
    locationRef.current = location.pathname;
    if (import.meta.env.DEV) {
      console.log('[BackButton] route changed:', location.pathname, 'public:', isPublicRoute(location.pathname));
    }
  }, [location.pathname]);

  useEffect(() => {
    const shouldRegisterRoot = !isPublicRoute(location.pathname);
    const existing = handlersRef.current.get(ROOT_HANDLER_ID);

    if (!shouldRegisterRoot) {
      if (existing?.isOpen) {
        try {
          logDiagnostic({
            event: 'backctx_unregister',
            details: {
              action: `${ROOT_HANDLER_ID}:ROOT`,
              id: ROOT_HANDLER_ID,
              priority: BACK_PRIORITY.ROOT,
              label: 'ROOT',
              reason: 'public_route',
            },
          });
        } catch { /* ignore */ }
      }
      handlersRef.current.delete(ROOT_HANDLER_ID);
      return;
    }

    handlersRef.current.set(ROOT_HANDLER_ID, {
      id: ROOT_HANDLER_ID,
      isOpen: true,
      onClose: consumeRootBack,
      priority: BACK_PRIORITY.ROOT,
      openedAt: 0,
      label: 'ROOT',
    });

    if (!existing?.isOpen) {
      try {
        logDiagnostic({
          event: 'backctx_register',
          details: {
            action: `${ROOT_HANDLER_ID}:ROOT`,
            id: ROOT_HANDLER_ID,
            priority: BACK_PRIORITY.ROOT,
            label: 'ROOT',
          },
        });
      } catch { /* ignore */ }
    }
  }, [consumeRootBack, location.pathname]);

  const register = useCallback((id: string, isOpen: boolean, onClose: () => void, priority = 0, label?: string) => {
    const existing = handlersRef.current.get(id);
    const wasOpen = existing?.isOpen ?? false;
    const nextLabel = label ?? existing?.label;

    // Nikad ne guraj history entry na public rutama — zarobilo bi korisnika.
    if (isOpen && !wasOpen && !isPublicRoute(locationRef.current)) {
      window.history.pushState({ backButtonId: id }, '');
      try {
        logDiagnostic({
          event: 'backctx_register',
          details: {
            action: `${id}:${nextLabel ?? ''}`,
            id,
            priority,
            ...(nextLabel ? { label: nextLabel } : {}),
          },
        });
      } catch { /* ignore */ }
    }

    if (!isOpen && wasOpen) {
      try {
        logDiagnostic({
          event: 'backctx_unregister',
          details: {
            action: `${id}:${nextLabel ?? ''}`,
            id,
            priority,
            ...(nextLabel ? { label: nextLabel } : {}),
            reason: 'closed',
          },
        });
      } catch { /* ignore */ }
    }

    handlersRef.current.set(id, {
      id,
      isOpen,
      onClose,
      priority,
      openedAt: isOpen && !wasOpen ? Date.now() : (existing?.openedAt ?? 0),
      label: nextLabel,
    });
  }, []);

  const unregister = useCallback((id: string) => {
    const existing = handlersRef.current.get(id);
    if (existing?.isOpen) {
      try {
        logDiagnostic({
          event: 'backctx_unregister',
          details: {
            action: `${id}:${existing.label ?? ''}`,
            id,
            priority: existing.priority,
            ...(existing.label ? { label: existing.label } : {}),
            reason: 'unmount',
          },
        });
      } catch { /* ignore */ }
    }
    handlersRef.current.delete(id);
  }, []);

  const getStackDepth = useCallback(() => {
    let n = 0;
    handlersRef.current.forEach((h) => { if (h.isOpen) n++; });
    return n;
  }, []);

  const handlePopState = useCallback((event?: PopStateEvent) => {
    const currentPath = locationRef.current;

    // Public rute → potpuno prepusti browseru.
    if (isPublicRoute(currentPath)) {
      if (import.meta.env.DEV) {
        console.log('[BackButton] popstate on public route — ignored:', currentPath);
      }
      return;
    }

    // BackButtonContext mora dobiti prvi pokušaj konzumacije backa. React
    // Router je također na window.popstate; ako njegov listener obradi event
    // prvi, route se promijeni i fullscreen/detail komponente se unmountaju,
    // pa unregister očisti stack prije nego što ga ovdje pročitamo.
    event?.stopImmediatePropagation?.();

    const openHandlers = getOpenHandlers();
    const layers = openHandlers.map(handlerLayer);

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
          topHandlerLabel: openHandlers[0]?.label ?? null,
          layers,
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
          details: {
            action: `${handler.id}:${handler.label ?? ''}`,
            id: handler.id,
            priority: handler.priority,
            ...(handler.label ? { label: handler.label } : {}),
            stackDepthBefore,
            layersBefore: layers,
          },
        });
      } catch { /* ignore */ }
      handler.onClose();
      window.setTimeout(() => {
        try {
          const layersAfter = getOpenLayers();
          logDiagnostic({
            event: 'backctx_stack_after',
            details: {
              action: `${handler.id}:${handler.label ?? ''}`,
              consumedHandlerId: handler.id,
              consumedHandlerPriority: handler.priority,
              consumedHandlerLabel: handler.label ?? null,
              stackDepthBefore,
              stackDepthAfter: layersAfter.length,
              layers: layersAfter,
            },
          });
        } catch { /* ignore */ }
      }, 0);
      return;
    }

    // Nema handlera — page-level back.
    consumeRootBack();
  }, [consumeRootBack, getOpenHandlers, getOpenLayers]);

  useEffect(() => {
    window.addEventListener('popstate', handlePopState, { capture: true });
    return () => {
      window.removeEventListener('popstate', handlePopState, { capture: true });
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
