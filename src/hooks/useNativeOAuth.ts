import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

/**
 * On native Capacitor platforms, opens OAuth in an in-app browser
 * and handles the deep-link callback to establish a Supabase session.
 *
 * On web, falls back to the standard lovable.auth flow (caller handles that).
 */
export const useNativeOAuth = () => {
  const [loading, setLoading] = useState(false);
  const resolveRef = useRef<((result: { error?: Error }) => void) | null>(null);

  const isNative = Capacitor.isNativePlatform();

  // Listen for deep-link callback containing OAuth tokens
  useEffect(() => {
    if (!isNative) return;

    let cleanup: (() => void) | undefined;

    const init = async () => {
      try {
        const { App } = await import('@capacitor/app');

        const handle = await App.addListener('appUrlOpen', async (event) => {
          console.log('[NativeOAuth] appUrlOpen:', event.url);

          try {
            const url = new URL(event.url);
            const params = new URLSearchParams(url.search || '');
            // Also check hash fragment (Supabase implicit flow puts tokens there)
            const hashParams = new URLSearchParams(url.hash?.replace('#', '') || '');

            const code = params.get('code') || hashParams.get('code');
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');

            // Close the in-app browser
            try {
              const { Browser } = await import('@capacitor/browser');
              await Browser.close();
            } catch { /* browser may already be closed */ }

            if (code) {
              // PKCE flow — exchange code for session
              const { error } = await supabase.auth.exchangeCodeForSession(code);
              if (resolveRef.current) {
                resolveRef.current({ error: error ? new Error(error.message) : undefined });
                resolveRef.current = null;
              }
              setLoading(false);
              return;
            }

            if (accessToken && refreshToken) {
              // Implicit flow — set session directly
              const { error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (resolveRef.current) {
                resolveRef.current({ error: error ? new Error(error.message) : undefined });
                resolveRef.current = null;
              }
              setLoading(false);
              return;
            }

            // Check for error in callback
            const errorDesc = params.get('error_description') || hashParams.get('error_description');
            if (errorDesc) {
              if (resolveRef.current) {
                resolveRef.current({ error: new Error(errorDesc) });
                resolveRef.current = null;
              }
              setLoading(false);
            }
          } catch (e) {
            console.error('[NativeOAuth] callback parse error:', e);
            if (resolveRef.current) {
              resolveRef.current({ error: e instanceof Error ? e : new Error(String(e)) });
              resolveRef.current = null;
            }
            setLoading(false);
          }
        });

        cleanup = () => handle.remove();
      } catch (e) {
        console.error('[NativeOAuth] init error:', e);
      }
    };

    init();
    return () => cleanup?.();
  }, [isNative]);

  /**
   * Start native OAuth flow for given provider.
   * Returns a promise that resolves when the session is established or on error.
   */
  const signInWithOAuth = async (provider: 'google' | 'apple'): Promise<{ error?: Error }> => {
    if (!isNative) {
      return { error: new Error('Not a native platform') };
    }

    setLoading(true);

    try {
      // Use Supabase to generate the OAuth URL with PKCE, but skip the browser redirect
      const redirectUrl = 'https://vmbalance.com';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error || !data?.url) {
        setLoading(false);
        return { error: error ? new Error(error.message) : new Error('No OAuth URL returned') };
      }

      // Open the OAuth URL in the in-app browser
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({
        url: data.url,
        presentationStyle: 'fullscreen',
      });

      // Also listen for browserFinished in case user cancels
      Browser.addListener('browserFinished', () => {
        if (resolveRef.current) {
          resolveRef.current({ error: new Error('OAuth cancelled by user') });
          resolveRef.current = null;
        }
        setLoading(false);
      });

      // Return a promise that resolves when the deep link callback fires
      return new Promise<{ error?: Error }>((resolve) => {
        resolveRef.current = resolve;

        // Timeout after 2 minutes
        setTimeout(() => {
          if (resolveRef.current) {
            resolveRef.current({ error: new Error('OAuth timeout') });
            resolveRef.current = null;
            setLoading(false);
          }
        }, 120000);
      });
    } catch (e) {
      setLoading(false);
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  };

  return { signInWithOAuth, loading, isNative };
};
