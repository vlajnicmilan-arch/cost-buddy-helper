import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

const NATIVE_REDIRECT = 'app.lovable.costbuddy://auth/callback';

/**
 * Native OAuth flow for Capacitor APK.
 *
 * Why we don't use lovable.auth.signInWithOAuth on native:
 * The Lovable broker redirects back to a https://vmbalance.com URL. On a
 * device that has the PWA installed AND the native APK installed, Android
 * routes that https URL to the PWA (or the system browser), so the session
 * never lands inside the APK WebView.
 *
 * Native flow instead:
 * 1. Ask Supabase for the OAuth URL with redirectTo set to a custom scheme
 *    (`app.lovable.costbuddy://auth/callback`) that only the APK can handle.
 * 2. Open that URL in Capacitor Browser (Chrome Custom Tab on Android).
 * 3. After the user authenticates, the provider → Supabase → custom scheme
 *    chain fires `appUrlOpen` inside the APK with the auth `code` in the URL.
 * 4. Close the in-app browser and call `exchangeCodeForSession(code)` so the
 *    APK WebView gets the session.
 */
export const useNativeOAuth = () => {
  const [loading, setLoading] = useState(false);
  const isNative = Capacitor.isNativePlatform();
  const pendingRef = useRef<{
    resolve: (v: { error?: Error }) => void;
  } | null>(null);

  useEffect(() => {
    if (!isNative) return;

    let removeListener: (() => void) | undefined;

    (async () => {
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('appUrlOpen', async (event) => {
        const url = event.url || '';
        if (!url.startsWith(NATIVE_REDIRECT)) return;

        try {
          const { Browser } = await import('@capacitor/browser');
          await Browser.close().catch(() => undefined);
        } catch {
          // ignore
        }

        try {
          // Parse code/error from either query or hash.
          const u = new URL(url);
          const search = new URLSearchParams(u.search || '');
          const hash = new URLSearchParams((u.hash || '').replace(/^#/, ''));
          const code = search.get('code') || hash.get('code');
          const errDesc =
            search.get('error_description') ||
            hash.get('error_description') ||
            search.get('error') ||
            hash.get('error');

          if (errDesc) {
            pendingRef.current?.resolve({ error: new Error(errDesc) });
            pendingRef.current = null;
            return;
          }

          if (!code) {
            pendingRef.current?.resolve({
              error: new Error('Missing OAuth code in callback'),
            });
            pendingRef.current = null;
            return;
          }

          const { error } = await supabase.auth.exchangeCodeForSession(code);
          pendingRef.current?.resolve({ error: error ?? undefined });
          pendingRef.current = null;
        } catch (e) {
          pendingRef.current?.resolve({
            error: e instanceof Error ? e : new Error(String(e)),
          });
          pendingRef.current = null;
        }
      });
      removeListener = () => handle.remove();
    })();

    return () => {
      removeListener?.();
    };
  }, [isNative]);

  const signInWithOAuth = async (
    provider: 'google' | 'apple'
  ): Promise<{ error?: Error }> => {
    if (!isNative) {
      return { error: new Error('Not a native platform') };
    }

    setLoading(true);
    try {
      const queryParams: Record<string, string> | undefined =
        provider === 'google' ? { prompt: 'select_account' } : undefined;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: NATIVE_REDIRECT,
          skipBrowserRedirect: true,
          queryParams,
        },
      });

      if (error || !data?.url) {
        return {
          error: error ?? new Error('Failed to start OAuth'),
        };
      }

      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: data.url, presentationStyle: 'popover' });

      // Wait for the deep-link listener to resolve.
      return await new Promise<{ error?: Error }>((resolve) => {
        pendingRef.current = { resolve };
      });
    } catch (e) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    } finally {
      setLoading(false);
    }
  };

  return { signInWithOAuth, loading, isNative };
};
