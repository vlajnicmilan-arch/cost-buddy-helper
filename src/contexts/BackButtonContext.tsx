import { createContext, useContext, useRef, useCallback, useEffect, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Global Back Button Manager
 * 
 * Handles the Android/browser back button centrally:
 * 1. If any dialog/overlay is registered as open → closes the most recently opened one
 * 2. If on a sub-page (/projects, /budgets, /wallet) → navigates to /
 * 3. If already on root page → pushes state back (prevents accidental app exit on web)
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

const ROOT_PAGES = ['/', '/dashboard'];

export function BackButtonProvider({ children }: { children: ReactNode }) {
  const handlersRef = useRef<Map<string, BackHandler>>(new Map());
  const navigate = useNavigate();
  const locationRef = useRef<string>('/');

  const location = useLocation();
  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);

  const register = useCallback((id: string, isOpen: boolean, onClose: () => void, priority = 0) => {
    const existing = handlersRef.current.get(id);
    const wasOpen = existing?.isOpen ?? false;

    if (isOpen && !wasOpen) {
      // Just opened → push a dummy history entry so back fires popstate
      window.history.pushState({ backButtonId: id }, '');
    }
    // Note: when closing programmatically, the popstate handler triggered by
    // history.back() inside the hook's useEffect will be ignored because
    // the handler is already marked closed before it fires.

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
    // Collect all currently open handlers
    const openHandlers = Array.from(handlersRef.current.values())
      .filter(h => h.isOpen)
      // Sort: highest priority first, then most recently opened first (LIFO)
      .sort((a, b) => b.priority - a.priority || b.openedAt - a.openedAt);

    if (openHandlers.length > 0) {
      // Close the topmost dialog
      const handler = openHandlers[0];
      // Mark as closed immediately so re-entrant popstate doesn't double-fire
      handler.isOpen = false;
      handler.onClose();
      return;
    }

    // No dialogs open — handle page-level back navigation
    const currentPath = locationRef.current;
    if (!ROOT_PAGES.includes(currentPath)) {
      navigate('/', { replace: false });
      return;
    }

    // Already on root — re-push state to prevent browser from leaving the app
    window.history.pushState(null, '');
  }, [navigate]);

  useEffect(() => {
    window.addEventListener('popstate', handlePopState);
    // Push an initial state so the very first back press doesn't immediately close the tab
    window.history.pushState(null, '');
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [handlePopState]);

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
