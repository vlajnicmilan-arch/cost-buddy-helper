import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { logDiagnostic } from '@/lib/diagnosticLogger';

const NATIVE_CALLBACK = 'app.lovable.costbuddy://auth/callback';
const HTTPS_BRIDGE = 'https://vmbalance.com/native-oauth/callback';

/**
 * Native OAuth flow for the Capacitor APK.
 *
 * 1. Ask Supabase for an OAuth URL with `redirectTo` set to the HTTPS bridge.
 *    Google/Supabase only accept HTTPS redirect URLs, so we cannot point them
 *    directly at our `app.lovable.costbuddy://` scheme.
 * 2. Open the URL in Capacitor Browser (Chrome Custom Tab on Android).
 * 3. The bridge page (`/native-oauth/callback`) flattens any URL fragment
 *    (`#access_token=...`) into the query string and immediately forwards
 *    everything to `app.lovable.costbuddy://auth/callback?...` using an
 *    explicit `intent://` URL targeted by package name. This forces the
 *    callback into the installed APK instead of the PWA / system browser.
 * 4. The APK receives the deep link via `appUrlOpen`, closes the in-app
 *    browser, and either:
 *      - calls `exchangeCodeForSession(code)` (PKCE flow), or
 *      - calls `setSession({ access_token, refresh_token })` (implicit flow)
 *    so the WebView ends up signed in.
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
        if (!url.startsWith(NATIVE_CALLBACK)) return;

        try {
          const { Browser } = await import('@capacitor/browser');
          await Browser.close().catch(() => undefined);
        } catch {
          // ignore
        }

        try {
          const u = new URL(url);
          const search = new URLSearchParams(u.search || '');
          const hash = new URLSearchParams((u.hash || '').replace(/^#/, ''));

          const pick = (key: string) => search.get(key) || hash.get(key);

          const errDesc =
            pick('error_description') || pick('error');
          if (errDesc) {
            logDiagnostic('native_oauth_callback_error', { message: errDesc });
            pendingRef.current?.resolve({ error: new Error(errDesc) });
            pendingRef.current = null;
            return;
          }

          const code = pick('code');
          const accessToken = pick('access_token');
          const refreshToken = pick('refresh_token');

          if (code) {
            logDiagnostic('native_oauth_callback_received', { kind: 'code' });
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) {
              logDiagnostic('native_oauth_exchange_failed', { message: error.message });
            }
            pendingRef.current?.resolve({ error: error ?? undefined });
            pendingRef.current = null;
            return;
          }

          if (accessToken && refreshToken) {
            logDiagnostic('native_oauth_callback_received', { kind: 'tokens' });
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) {
              logDiagnostic('native_oauth_set_session_failed', { message: error.message });
            }
            pendingRef.current?.resolve({ error: error ?? undefined });
            pendingRef.current = null;
            return;
          }

          logDiagnostic('native_oauth_callback_missing_payload', {
            hasSearch: !!u.search,
            hasHash: !!u.hash,
          });
          pendingRef.current?.resolve({
            error: new Error('Missing OAuth payload in callback'),
          });
          pendingRef.current = null;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          logDiagnostic('native_oauth_callback_exception', { message });
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

      logDiagnostic('native_oauth_start', { provider });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: HTTPS_BRIDGE,
          skipBrowserRedirect: true,
          queryParams,
        },
      });

      if (error || !data?.url) {
        logDiagnostic('native_oauth_url_failed', {
          message: error?.message ?? 'no_url',
        });
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
      const message = e instanceof Error ? e.message : String(e);
      logDiagnostic('native_oauth_exception', { message });
      return { error: e instanceof Error ? e : new Error(String(e)) };
    } finally {
      setLoading(false);
    }
  };

  return { signInWithOAuth, loading, isNative };
};
