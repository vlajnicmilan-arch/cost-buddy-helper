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
const isFastLanding = (path === "/" || path === "/landing") && !isInstalledApp();
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

// Funnel: log install once per device (best-effort, deferred to idle).
idle(() => {
  import('./lib/funnelTracking')
    .then(({ logFunnelEvent }) => logFunnelEvent('install', {
      installed_app: isInstalledApp(),
      referrer: typeof document !== 'undefined' ? document.referrer || null : null,
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
  console.log('[Boot] V&M Balance starting', {
    href: window.location.href,
    pathname: window.location.pathname,
    isCapacitor: !!(window as any).Capacitor?.isNativePlatform?.(),
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    ua: navigator.userAgent,
  });
} catch {}

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
  });
}
