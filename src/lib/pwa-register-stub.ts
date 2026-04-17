import { useCallback, useEffect, useRef, useState } from 'react';

type RegisterSWOptions = {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegistered?: (registration?: ServiceWorkerRegistration) => void;
  onRegisteredSW?: (
    swUrl: string,
    registration?: ServiceWorkerRegistration
  ) => void;
  onRegisterError?: (error: unknown) => void;
};

/**
 * Stub for `virtual:pwa-register/react`. The real PWA service worker has been
 * removed because it cached stale builds and broke the Capacitor APK on
 * /setup. This stub preserves the original hook signature so existing UI
 * (update prompt, auto-update toggle) keeps compiling and running, but it
 * never registers a Service Worker.
 */
export const useRegisterSW = (options: RegisterSWOptions = {}) => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    try {
      options.onRegisteredSW?.('/sw.js', undefined);
      options.onRegistered?.(undefined);
    } catch {
      /* no-op */
    }
  }, [options]);

  const updateServiceWorker = useCallback(async (_reloadPage?: boolean) => {
    setNeedRefresh(false);
    setOfflineReady(false);
  }, []);

  return {
    needRefresh: [needRefresh, setNeedRefresh] as const,
    offlineReady: [offlineReady, setOfflineReady] as const,
    updateServiceWorker,
  };
};
