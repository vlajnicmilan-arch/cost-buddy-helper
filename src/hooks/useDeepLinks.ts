import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

export const useDeepLinks = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanup: (() => void) | undefined;

    const init = async () => {
      try {
        const { App } = await import('@capacitor/app');

        const handle = await App.addListener('appUrlOpen', (event) => {
          console.log('[DeepLink] URL:', event.url);
          try {
            const url = new URL(event.url);
            const path = url.pathname;
            const params = new URLSearchParams(url.search || '');
            const hashParams = new URLSearchParams(url.hash?.replace('#', '') || '');

            // Skip OAuth callback URLs — handled by useNativeOAuth
            const isOAuthCallback =
              params.has('code') ||
              hashParams.has('access_token') ||
              params.has('error_description') ||
              hashParams.has('error_description');

            if (isOAuthCallback) {
              console.log('[DeepLink] Skipping OAuth callback (handled by useNativeOAuth)');
              return;
            }

            // Match known deep link patterns
            const patterns = [
              /^\/join-family\/(.+)$/,
              /^\/join-budget\/(.+)$/,
              /^\/join-project\/(.+)$/,
            ];

            for (const pattern of patterns) {
              if (pattern.test(path)) {
                navigate(path);
                return;
              }
            }

            // Generic: navigate to any path from our domain
            if (url.hostname === 'vmbalance.com' || url.hostname === 'www.vmbalance.com') {
              if (path && path !== '/') {
                navigate(path);
              }
            }
          } catch (e) {
            console.error('[DeepLink] Parse error:', e);
          }
        });

        cleanup = () => handle.remove();
      } catch (e) {
        console.error('[DeepLink] Init error:', e);
      }
    };

    init();

    return () => cleanup?.();
  }, [navigate]);
};
