import { useEffect } from 'react';
import {
  armLandingExitFlush,
  deviceTypeFromWidth,
  logLandingPageReady,
  pickPageReadyMs,
  describeAnchorClick,
  flushLandingTelemetryOnExit,
  logLandingClick,
  logLandingPageView,
  logLandingScroll,
  logLandingSectionView,
  logLandingTimeOnPage,
  scrollThreshold,
  setLandingContext,
  slugifyTarget,
} from '@/lib/landingTelemetry';
import { rememberAuthEntry } from '@/lib/authFunnel';

/** Last section seen + deepest scroll — reported once on exit. */
const exitState = { lastSection: null as string | null, maxScrollPct: 0 };


/**
 * Landing analytics. Attaches:
 *  - page_view once per session
 *  - section_view via IntersectionObserver (sections labelled by heading text)
 *  - cta_click / link_click via delegated click listener
 *  - scroll_depth thresholds
 *  - time_on_page on pagehide / unmount
 *
 * Purely observational — never alters landing behaviour.
 */
export const useLandingTelemetry = (
  rootRef: React.RefObject<HTMLElement>,
  lang: string,
  theme: string,
) => {
  // Keep lang/theme on every emitted row.
  useEffect(() => {
    setLandingContext(lang, theme);
  }, [lang, theme]);

  // page_view + scroll depth + time on page (mount-scoped)
  useEffect(() => {
    logLandingPageView({ referrer: (document.referrer || '').slice(0, 300) });
    const startedAt = Date.now();

    // page_ready — how long the visitor waited for the first screen.
    let lcpMs: number | null = null;
    let lcpObserver: PerformanceObserver | null = null;
    try {
      if (typeof PerformanceObserver !== 'undefined') {
        lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1] as PerformanceEntry | undefined;
          if (last) lcpMs = last.startTime;
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true } as any);
      }
    } catch {
      /* noop */
    }
    const reportPageReady = () => {
      try {
        const nav = performance.getEntriesByType('navigation')[0] as
          | PerformanceNavigationTiming
          | undefined;
        const ms = pickPageReadyMs(lcpMs, nav?.domContentLoadedEventEnd ?? null);
        if (ms == null) return;
        const width = window.innerWidth || 0;
        logLandingPageReady(ms, {
          source: lcpMs && lcpMs > 0 ? 'lcp' : 'dcl',
          viewport_width: width,
          device_type: deviceTypeFromWidth(width),
        });
      } catch {
        /* noop */
      }
    };
    const readyTimer = setTimeout(reportPageReady, 4000);

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const doc = document.documentElement;
        const total = doc.scrollHeight - window.innerHeight;
        if (total <= 0) return;
        const pct = Math.min(100, Math.round(((window.scrollY || doc.scrollTop) / total) * 100));
        if (pct > exitState.maxScrollPct) exitState.maxScrollPct = pct;
        const th = scrollThreshold(pct);
        if (th) logLandingScroll(th);
      });
    };

    const onHide = () => {
      logLandingTimeOnPage(Math.round((Date.now() - startedAt) / 1000), {
        last_section: exitState.lastSection,
        max_scroll_pct: exitState.maxScrollPct,
      });
      flushLandingTelemetryOnExit();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
      else armLandingExitFlush();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    onScroll();

    return () => {
      clearTimeout(readyTimer);
      try { lcpObserver?.disconnect(); } catch { /* noop */ }
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      onHide();
    };
  }, []);


  // section_view + click delegation (re-attach when body markup changes)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sections = Array.from(root.querySelectorAll('section'));
    const labelFor = (el: Element, idx: number): string => {
      const id = el.getAttribute('id');
      if (id) return slugifyTarget(id);
      const cls = el.getAttribute('class');
      if (cls) return slugifyTarget(cls.split(/\s+/)[0]);
      const heading = el.querySelector('h1, h2, h3');
      const text = heading?.textContent?.trim();
      if (text) return `s${idx + 1}-${slugifyTarget(text)}`;
      return `s${idx + 1}`;
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const label = e.target.getAttribute('data-tel-section');
          if (label) {
            exitState.lastSection = label;
            logLandingSectionView(label);
          }
          io.unobserve(e.target);
        });
      },
      { threshold: 0.5 },
    );
    sections.forEach((el, idx) => {
      el.setAttribute('data-tel-section', labelFor(el, idx));
      io.observe(el);
    });

    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      const anchor = el?.closest('a');
      if (!anchor) return;
      const d = describeAnchorClick({
        href: anchor.getAttribute('href') || '',
        className: anchor.getAttribute('class') || '',
        text: anchor.textContent || '',
        telemetryTarget: anchor.getAttribute('data-telemetry-target'),
      });
      if (d) {
        logLandingClick(d);
        if (/\/auth(\?|$|#)/.test(d.href)) {
          rememberAuthEntry(d.target, window.location.pathname);
        }
      }
    };

    root.addEventListener('click', onClick, true);

    return () => {
      io.disconnect();
      root.removeEventListener('click', onClick, true);
      sections.forEach((el) => el.removeAttribute('data-tel-section'));
    };
  }, [rootRef, lang]);
};
