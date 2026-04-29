/**
 * Sentry initialization for V&M Balance.
 *
 * - DSN is public by design (frontend bundles always expose it).
 * - EU region (Frankfurt) — GDPR friendly.
 * - Error monitoring only: tracing + replays disabled to stay under
 *   the free tier 5k events/month quota.
 * - `beforeSend` filters out known-benign noise (AbortError, Capacitor
 *   plugin-not-implemented, ResizeObserver loops, offline network errors).
 *
 * The logger MUST never break the app — every public function is wrapped
 * in try/catch and silently swallows failures.
 */
import * as Sentry from '@sentry/react';
import { APP_VERSION } from '@/lib/version';

const DSN = 'https://e71c65a2c4b6da7f654257df9b5fa8f0@o4511302417973248.ingest.de.sentry.io/4511302422167632';

const SENTRY_ORG_URL = 'https://tactura-jdoo.sentry.io/issues/';

let initialized = false;

const detectEnvironment = (): string => {
  try {
    const host = window.location.hostname;
    const cap = (window as any).Capacitor?.isNativePlatform?.();
    if (cap) return 'native';
    if (host === 'vmbalance.com' || host === 'www.vmbalance.com') return 'production';
    if (host.includes('id-preview--') || host.includes('lovableproject.com')) return 'preview';
    if (host === 'localhost' || host === '127.0.0.1') return 'development';
    return 'production';
  } catch {
    return 'unknown';
  }
};

const detectPlatform = (): 'web' | 'android' | 'ios' => {
  try {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.()) {
      const p = cap.getPlatform?.();
      if (p === 'android') return 'android';
      if (p === 'ios') return 'ios';
    }
  } catch {
    /* ignore */
  }
  return 'web';
};

/** Strings whose presence in an error message means we should drop the event. */
const NOISE_PATTERNS: string[] = [
  'AbortError',
  'signal is aborted',
  'aborted without reason',
  'is not implemented on',
  'UNIMPLEMENTED',
  'ResizeObserver loop',
  'ResizeObserver loop limit exceeded',
  'Non-Error promise rejection captured',
  // Network errors when offline are user-network noise, not bugs
  'NetworkError when attempting to fetch resource',
  'Failed to fetch',
  'Load failed',
];

const isNoise = (msg: string | undefined): boolean => {
  if (!msg) return false;
  return NOISE_PATTERNS.some((p) => msg.includes(p));
};

export const initSentry = (): void => {
  if (initialized) return;
  if (typeof window === 'undefined') return;

  try {
    const environment = detectEnvironment();

    // In dev we don't send anything to Sentry — too noisy and wastes quota.
    if (environment === 'development') {
      console.log('[Sentry] Skipped init in development environment');
      return;
    }

    Sentry.init({
      dsn: DSN,
      environment,
      release: APP_VERSION ? `vmbalance@${APP_VERSION}` : undefined,
      // Errors only — no performance / replay (free tier optimization).
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      // GDPR: don't auto-capture IP/UA/cookies.
      sendDefaultPii: false,
      // Default integrations are fine; we explicitly disable browser tracing
      // by not enabling its integration and setting tracesSampleRate to 0.
      integrations: (defaults) =>
        defaults.filter((i) => i.name !== 'BrowserTracing' && i.name !== 'Replay'),

      beforeSend(event, hint) {
        try {
          // Drop offline errors entirely — user network problem, not our bug.
          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            return null;
          }

          const err = hint?.originalException as any;
          const msg =
            (typeof err?.message === 'string' && err.message) ||
            event.message ||
            event.exception?.values?.[0]?.value;

          if (isNoise(msg)) return null;

          // Strip query strings from URLs in case they contain tokens.
          if (event.request?.url) {
            try {
              const u = new URL(event.request.url);
              event.request.url = `${u.origin}${u.pathname}`;
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* never block sending due to filter errors */
        }
        return event;
      },

      beforeBreadcrumb(breadcrumb) {
        // Strip console.log breadcrumbs (keep warn/error/info-as-error).
        if (breadcrumb.category === 'console' && breadcrumb.level === 'log') {
          return null;
        }
        return breadcrumb;
      },
    });

    Sentry.setTag('platform', detectPlatform());
    Sentry.setTag('app_version', APP_VERSION ?? 'unknown');

    initialized = true;
    console.log(`[Sentry] Initialized (env=${environment}, platform=${detectPlatform()})`);
  } catch (e) {
    console.warn('[Sentry] init failed:', e);
  }
};

export const setSentryUser = (userId: string | null): void => {
  try {
    if (!initialized) return;
    Sentry.setUser(userId ? { id: userId } : null);
  } catch {
    /* ignore */
  }
};

export const captureSentryException = (
  error: unknown,
  context?: Record<string, unknown>
): void => {
  try {
    if (!initialized) return;
    if (context) {
      Sentry.captureException(error, { contexts: { custom: context } });
    } else {
      Sentry.captureException(error);
    }
  } catch {
    /* ignore */
  }
};

export const triggerSentryTestError = (): void => {
  // Used by Admin "Test Sentry" button.
  throw new Error('Sentry test from V&M Balance admin panel');
};

export const getSentryDashboardUrl = (): string => SENTRY_ORG_URL;

export const isSentryInitialized = (): boolean => initialized;
