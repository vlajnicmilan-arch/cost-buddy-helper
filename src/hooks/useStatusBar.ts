import { useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

export const useStatusBar = () => {
  const isNative = Capacitor.isNativePlatform();

  const setStatusBarStyle = useCallback(async (isDark: boolean) => {
    if (!isNative) return;
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
      await StatusBar.setBackgroundColor({ color: isDark ? '#0b0c0e' : '#ffffff' });
    } catch (e) {
      console.warn('StatusBar plugin not available:', e);
    }
  }, [isNative]);

  const setOverlaysWebView = useCallback(async (overlay: boolean) => {
    if (!isNative) return;
    try {
      const { StatusBar } = await import('@capacitor/status-bar');
      await StatusBar.setOverlaysWebView({ overlay });
    } catch (e) {
      console.warn('StatusBar overlay not available:', e);
    }
  }, [isNative]);

  // Auto-detect theme on mount
  useEffect(() => {
    if (!isNative) return;
    const isDark = document.documentElement.classList.contains('dark');
    setStatusBarStyle(isDark);

    // Observe theme changes
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark');
      setStatusBarStyle(dark);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [isNative, setStatusBarStyle]);

  return { setStatusBarStyle, setOverlaysWebView };
};
