import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { lovable } from '@/integrations/lovable/index';

/**
 * On native Capacitor platforms, opens OAuth in an in-app browser
 * and handles the deep-link callback to establish a Supabase session.
 *
 * On web, falls back to the standard lovable.auth flow (caller handles that).
 */
export const useNativeOAuth = () => {
  const [loading, setLoading] = useState(false);
  const isNative = Capacitor.isNativePlatform();

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
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });

      if (result.error) {
        return { error: result.error instanceof Error ? result.error : new Error(String(result.error)) };
      }

      return {};
    } catch (e) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    } finally {
      setLoading(false);
    }
  };

  return { signInWithOAuth, loading, isNative };
};
