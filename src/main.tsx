import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { logDiagnostic } from "./lib/diagnosticLogger";

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

idle(() => {
  // Dynamic import keeps Sentry out of the initial JS bundle entirely.
  import('./lib/sentry').then(({ initSentry }) => initSentry()).catch(() => {});
  logDiagnostic('boot_start', {
    href: window.location.href,
    pathname: window.location.pathname,
  });
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
      logDiagnostic('splash_hide_attempt');
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.hide({ fadeOutDuration: 0 });
      console.log('[Boot] Splash screen hidden');
      logDiagnostic('splash_hide_success');
    } else {
      logDiagnostic('splash_skip_not_native');
    }
  } catch (e) {
    console.warn('[Boot] SplashScreen.hide failed (non-fatal):', e);
    logDiagnostic('splash_hide_error', { message: (e as Error)?.message });
  }
})();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
