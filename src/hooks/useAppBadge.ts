import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

export const useAppBadge = () => {
  const isNative = Capacitor.isNativePlatform();

  const setBadge = useCallback(async (count: number) => {
    try {
      if (isNative) {
        const { Badge } = await import('@capawesome/capacitor-badge');
        if (count > 0) {
          await Badge.set({ count });
        } else {
          await Badge.clear();
        }
        return;
      }
      // Web fallback (PWA)
      if ('setAppBadge' in navigator) {
        if (count > 0) {
          await (navigator as any).setAppBadge(count);
        } else {
          await (navigator as any).clearAppBadge();
        }
      }
    } catch (e) {
      console.warn('Badge not supported:', e);
    }
  }, [isNative]);

  const clearBadge = useCallback(async () => {
    await setBadge(0);
  }, [setBadge]);

  return { setBadge, clearBadge };
};
