import { createContext, useContext, useRef, useCallback, useEffect, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isPublicRoute, isRootAppRoute } from '@/lib/publicRoutes';

/**
 * Global Back Button Manager
 *
 * Handles the Android/browser back button centrally:
 * 1. If on a public route (/auth, /setup, /install, /, …) → DO NOTHING.
 *    The back button must behave normally so the user can leave / navigate
 *    back through the natural history stack. Intercepting back here was
 *    the cause of the "have to press back twice and screen stays frozen"
 *    bug on the Android APK.
 * 2. If any dialog/overlay is registered as open → closes the most
 *    recently opened one (LIFO).
 * 3. If on an authenticated app sub-page → navigates to /home.
 * 4. If already on a root app page → re-push state to prevent the WebView
 *    from leaving the app accidentally.
 */

type BackHandler = {
  id: string;
  isOpen: boolean;
  onClose: () => void;
  priority: number;
  openedAt: number; // timestamp when opened, for LIFO ordering
};

type BackButtonContextType = {
  register: (id: string, isOpen: boolean, onClose: () => void, priority?: number) => void;
  unregister: (id: string) => void;
};

const BackButtonContext = createContext<BackButtonContextType | null>(null);

export function BackButtonProvider({ children }: { children: ReactNode }) {
  const handlersRef = useRef<Map<string, BackHandler>>(new Map());
  const navigate = useNavigate();
  const locationRef = useRef<string>('/');
  const initialStatePushedRef = useRef(false);

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

    // Never push synthetic history entries on public routes — it traps the user.
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

  const handlePopState = useCallback(() => {
    const currentPath = locationRef.current;

    // PUBLIC ROUTES: do not intercept anything. Let the WebView/browser handle
    // the back navigation naturally. This is critical for the auth/setup flow
    // on Android, where intercepting was leaving the user on a frozen screen.
    if (isPublicRoute(currentPath)) {
      if (import.meta.env.DEV) {
        console.log('[BackButton] popstate on public route — ignored:', currentPath);
      }
      return;
    }

    // Collect all currently open handlers
    const openHandlers = Array.from(handlersRef.current.values())
      .filter(h => h.isOpen)
      .sort((a, b) => b.priority - a.priority || b.openedAt - a.openedAt);

    if (openHandlers.length > 0) {
      const handler = openHandlers[0];
      handler.isOpen = false;
      handler.onClose();
      return;
    }

    // No dialogs open — handle page-level back navigation in app area
    if (!isRootAppRoute(currentPath)) {
      navigate('/home', { replace: false });
      return;
    }

    // Already on a root app route — re-push state so the WebView doesn't exit
    window.history.pushState(null, '');
  }, [navigate]);

  useEffect(() => {
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [handlePopState]);

  // Push the initial guard state ONLY once we're inside the authenticated app,
  // never on public routes (otherwise back from /auth or /setup gets trapped).
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
    <BackButtonContext.Provider value={{ register, unregister }}>
      {children}
    </BackButtonContext.Provider>
  );
}

export function useBackButtonContext() {
  const ctx = useContext(BackButtonContext);
  if (!ctx) throw new Error('useBackButtonContext must be used within BackButtonProvider');
  return ctx;
}
