import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import Landing from "./pages/Landing";

// Defer Sentry init + boot diagnostics until the browser is idle. These are
// observability tools — they MUST NOT block first paint or LCP. They run
// after the initial render is committed.
const idle = (cb: () => void) => {
  if (typeof (window as any).requestIdleCallback === 'function') {
    (window as any).requestIdleCallback(cb, { timeout: 2000 });
  } else {
    setTimeout(cb, 1);
  }
};

const isInstalledApp = () => {
  if (typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor.isNativePlatform?.()) return true;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if ((navigator as any).standalone === true) return true;
  return false;
};

const path = window.location.pathname;

// Native OAuth bridge must capture the original callback payload before any
// auth client can detect the URL session and clean ?code=... / #access_token=...
// from the address bar. The bridge page later forwards this saved payload to
// the Capacitor deep link so the APK can finish sign-in.
const NATIVE_OAUTH_PAYLOAD_KEY = 'vmb-native-oauth-callback-payload';
if (path === '/native-oauth/callback') {
  try {
    const payload = `${window.location.search || ''}${window.location.hash || ''}`;
    if (
      payload.includes('code=') ||
      payload.includes('access_token=') ||
      payload.includes('refresh_token=') ||
      payload.includes('error=') ||
      payload.includes('error_description=')
    ) {
      sessionStorage.setItem(NATIVE_OAUTH_PAYLOAD_KEY, payload);
    }
  } catch {
    // Storage can be unavailable in restricted browser modes; bridge will then
    // fall back to the live URL payload if it is still present.
  }
}

// Detect OAuth callback fragments/queries (e.g. when an OAuth provider redirects
// back to the root URL with #access_token=... or ?error=...). In that case we
// must boot the full app so the auth flow can complete instead of rendering
// the static landing page.
const hasAuthHashOrQuery = (() => {
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  return (
    hash.includes("access_token=") ||
    hash.includes("refresh_token=") ||
    hash.includes("error=") ||
    hash.includes("error_description=") ||
    search.includes("code=") ||
    search.includes("error=") ||
    search.includes("error_description=")
  );
})();

// Detect an existing Supabase auth session in localStorage. If the user is
// already signed in, never short-circuit to the landing page.
const hasStoredAuthSession = (() => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || "";
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const value = localStorage.getItem(key);
        if (value && value !== "null") return true;
      }
    }
  } catch {}
  return false;
})();

const isFastLanding =
  (path === "/" || path === "/landing") &&
  !isInstalledApp() &&
  !hasAuthHashOrQuery &&
  !hasStoredAuthSession;
const CRISP_WEBSITE_ID = "83888a2d-5927-4961-a7b1-eb91af074a0d";
const CRISP_SCRIPT_ID = "crisp-chat-loader";

const loadFastLandingCrisp = () => {
  const w = window as any;
  w.$crisp = w.$crisp || [];
  w.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;
  if (document.getElementById(CRISP_SCRIPT_ID)) return;

  const script = document.createElement("script");
  script.id = CRISP_SCRIPT_ID;
  script.src = "https://client.crisp.chat/l.js";
  script.async = true;
  document.head.appendChild(script);
};

// Funnel: capture UTM params synchronously (URL may change after redirects),
// then log install once per device (best-effort, deferred to idle).
import('./lib/funnelTracking')
  .then(({ captureUtmParams }) => captureUtmParams())
  .catch(() => {});

idle(() => {
  import('./lib/funnelTracking')
    .then(({ logFunnelEvent }) => logFunnelEvent('install', {
      installed_app: isInstalledApp(),
    }))
    .catch(() => {});
});

if (!isFastLanding) idle(() => {
  // Dynamic import keeps Sentry out of the initial JS bundle entirely.
  // Sentry self-checks analytics consent before initializing; we also re-init
  // when the user opts in later via the cookie banner.
  import('./lib/sentry').then(({ initSentry }) => {
    initSentry();
    import('./lib/consentManager').then(({ onConsentChange }) => {
      onConsentChange((state) => {
        if (state.analytics) initSentry();
      });
    }).catch(() => {});
  }).catch(() => {});
  import('./lib/diagnosticLogger')
    .then(({ logDiagnostic }) => logDiagnostic('boot_start', {
      href: window.location.href,
      pathname: window.location.pathname,
    }))
    .catch(() => {});
});

// Aggressively kill any leftover Service Worker + PWA caches.
// The Capacitor APK loads vmbalance.com, so a previously registered PWA
// service worker can intercept /setup and serve a stale bundle that
// blocks taps. We purge it on every load in any non-trusted context.
(() => {
  const ua = (navigator.userAgent || "").toLowerCase();
  const isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.();
  const isAndroidWebView = /\bwv\b/.test(ua) || /; wv\)/.test(ua);
  const isInIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  const isPreviewHost =
    window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com");
  const isProdHost =
    window.location.hostname === "vmbalance.com" ||
    window.location.hostname === "www.vmbalance.com";

  const shouldKillSW =
    isCapacitor || isAndroidWebView || isInIframe || isPreviewHost || isProdHost;

  if (shouldKillSW) {
    navigator.serviceWorker?.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister().catch(() => undefined));
    }).catch(() => undefined);

    if (typeof caches !== "undefined" && caches?.keys) {
      caches.keys().then((keys) => {
        keys.forEach((k) => caches.delete(k).catch(() => undefined));
      }).catch(() => undefined);
    }
  }
})();

// Boot diagnostics — these always log so we can see them in `chrome://inspect`
// when the APK is connected. Helps confirm which bundle/route is active.
try {
  console.log('[Boot] Centar starting', {
    href: window.location.href,
    pathname: window.location.pathname,
    isCapacitor: !!(window as any).Capacitor?.isNativePlatform?.(),
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    ua: navigator.userAgent,
  });
} catch {}

// Boot watchdog — detects if previous boot died before reaching React mount.
// On every cold start we set a flag in localStorage, and clear it once React
// successfully renders. If on next boot the flag is still set, we know the
// last session crashed silently (likely native crash inside a Capacitor
// plugin or WebView OOM) and we log a `previous_boot_crashed` event so we can
// see it in app_diagnostics_logs without needing logcat.
const BOOT_FLAG = 'vmb-boot-in-progress';
const BOOT_TS_FLAG = 'vmb-boot-in-progress-started-at';

// Skip watchdog entirely in Vite dev (HMR reloads cause false-positive
// `previous_boot_crashed` events because React unmount clears the flag too late).
const isDevHmr = import.meta.env.DEV;

// In Lovable preview deploys (non-native, lovable.app host) we still want
// visibility but at lower severity — these environments get frequent reloads
// from the editor and are not representative of real user crashes.
const isPreviewEnv = (() => {
  try {
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    if (isNative) return false;
    const host = window.location.hostname;
    return host.endsWith('.lovable.app') || host.endsWith('.lovableproject.com');
  } catch {
    return false;
  }
})();

if (!isDevHmr) {
  try {
    const prevFlag = localStorage.getItem(BOOT_FLAG);
    const prevTs = localStorage.getItem(BOOT_TS_FLAG);
    if (prevFlag === '1') {
      // We don't await this — diagnosticLogger is loaded async. Use idle so it
      // doesn't compete with React boot.
      idle(() => {
        import('./lib/diagnosticLogger')
          .then(({ logDiagnostic }) => logDiagnostic({
            event: 'previous_boot_crashed',
            severity: isPreviewEnv ? 'info' : 'critical',
            details: {
              previous_started_at: prevTs,
              isCapacitor: !!(window as any).Capacitor?.isNativePlatform?.(),
              href: window.location.href,
              env: isPreviewEnv ? 'preview' : 'production',
            },
          }))
          .catch(() => {});
      });
    }
    localStorage.setItem(BOOT_FLAG, '1');
    localStorage.setItem(BOOT_TS_FLAG, new Date().toISOString());
  } catch { /* localStorage unavailable */ }
}


const markBootCompleted = () => {
  try {
    localStorage.removeItem(BOOT_FLAG);
    localStorage.removeItem(BOOT_TS_FLAG);
  } catch { /* ignore */ }
  idle(() => {
    import('./lib/diagnosticLogger')
      .then(({ logDiagnostic }) => logDiagnostic('boot_completed', {
        ms_since_navigation: Math.round(performance.now()),
      }))
      .catch(() => {});
  });
};

// CRITICAL: Force-hide the Capacitor splash screen as soon as JS boots.
// Without this, the native splash can linger as an invisible overlay on
// some Android WebView versions, swallowing every touch event and making
// the StorageSetup / Auth screens look frozen.
(async () => {
  try {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.()) {
      const { logDiagnostic } = await import('./lib/diagnosticLogger');
      logDiagnostic('splash_hide_attempt');
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.hide({ fadeOutDuration: 0 });
      console.log('[Boot] Splash screen hidden');
      logDiagnostic('splash_hide_success');
    }
  } catch (e) {
    console.warn('[Boot] SplashScreen.hide failed (non-fatal):', e);
    if ((window as any).Capacitor?.isNativePlatform?.()) {
      import('./lib/diagnosticLogger')
        .then(({ logDiagnostic }) => logDiagnostic('splash_hide_error', { message: (e as Error)?.message }))
        .catch(() => {});
    }
  }
})();

const root = createRoot(document.getElementById("root")!);

if (isFastLanding) {
  idle(loadFastLandingCrisp);
  root.render(
    <React.StrictMode>
      <Landing />
    </React.StrictMode>
  );
  // Landing renders synchronously → boot reached React mount.
  markBootCompleted();
} else {
  Promise.all([
    import("./i18n"),
    import("./App.tsx"),
    import("./components/ErrorBoundary"),
  ]).then(([, { default: App }, { ErrorBoundary }]) => {
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
    // App tree is now rendering. Mark boot completed on the next frame so we
    // know React actually executed the first commit (vs. only the dynamic
    // imports succeeding).
    requestAnimationFrame(() => markBootCompleted());
  });
}
