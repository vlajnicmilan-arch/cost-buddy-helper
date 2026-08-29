/**
 * Landing performance instrumentation.
 *
 * Measures WHAT is slow on the public sales page ("/"), not just how long the
 * page took. Everything runs AFTER `load` and reports through the existing
 * diagnostics path (`performance_metric` in `app_diagnostics_logs`) — the
 * module never blocks rendering and never throws.
 *
 * Collected:
 *   - LCP + the element that caused it
 *   - CLS (cumulative, at report time)
 *   - INP (falls back to FID when INP is unavailable)
 *   - transferSize + request count until report, split by resource kind
 *   - isFastLanding flag and navigator.connection.effectiveType
 */

export interface ResourceBucket {
  n: number;
  kb: number;
}

export type ResourceKind = 'document' | 'js' | 'css' | 'font' | 'img' | 'other';

/** Classify a resource entry into a reporting bucket. Pure — unit tested. */
export const classifyResource = (name: string, initiatorType: string): ResourceKind => {
  const url = (name || '').split('?')[0].toLowerCase();
  if (initiatorType === 'navigation') return 'document';
  if (/\.(js|mjs)$/.test(url) || initiatorType === 'script') return 'js';
  if (/\.css$/.test(url) || url.includes('fonts.googleapis.com')) return 'css';
  if (/\.(woff2?|ttf|otf|eot)$/.test(url) || url.includes('fonts.gstatic.com')) return 'font';
  if (/\.(webp|avif|png|jpe?g|gif|svg|ico)$/.test(url) || initiatorType === 'img') return 'img';
  return 'other';
};

/** Aggregate resource timings into per-kind buckets. Pure — unit tested. */
export const summarizeResources = (
  entries: Array<{ name: string; initiatorType: string; transferSize?: number }>,
): { buckets: Record<string, ResourceBucket>; totalKb: number; requests: number } => {
  const buckets: Record<string, ResourceBucket> = {};
  let totalBytes = 0;
  for (const e of entries) {
    const kind = classifyResource(e.name, e.initiatorType);
    const bytes = Number(e.transferSize ?? 0);
    const b = buckets[kind] ?? { n: 0, kb: 0 };
    b.n += 1;
    b.kb += bytes;
    buckets[kind] = b;
    totalBytes += bytes;
  }
  for (const k of Object.keys(buckets)) {
    buckets[k].kb = Math.round(buckets[k].kb / 1024);
  }
  return {
    buckets,
    totalKb: Math.round(totalBytes / 1024),
    requests: entries.length,
  };
};

/** Short, stable label for the LCP element. Pure — unit tested. */
export const describeLcpElement = (
  el: { tagName?: string; className?: unknown; id?: string } | null,
  url?: string,
): string => {
  if (el) {
    const tag = (el.tagName || 'el').toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls =
      typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
        : '';
    return `${tag}${id}${cls}`.slice(0, 80);
  }
  if (url) return url.split('/').pop()?.slice(0, 80) ?? 'unknown';
  return 'unknown';
};

const REPORT_DELAY_MS = 6000;

/**
 * Start collecting. Safe to call once per page load; no-ops without the
 * required browser APIs.
 */
export const startLandingPerf = (isFastLanding: boolean): void => {
  try {
    if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

    let lcp = 0;
    let lcpTarget = 'unknown';
    let cls = 0;
    let inp = 0;
    let inpSource: 'inp' | 'fid' | 'none' = 'none';

    const observe = (type: string, cb: (entries: any[]) => void) => {
      try {
        const po = new PerformanceObserver((list) => cb(list.getEntries() as any[]));
        po.observe({ type, buffered: true } as any);
        return po;
      } catch {
        return null;
      }
    };

    const observers = [
      observe('largest-contentful-paint', (entries) => {
        const last = entries[entries.length - 1];
        if (!last) return;
        lcp = Math.round(last.startTime);
        lcpTarget = describeLcpElement(last.element ?? null, last.url);
      }),
      observe('layout-shift', (entries) => {
        for (const e of entries) if (!e.hadRecentInput) cls += e.value;
      }),
      observe('event', (entries) => {
        for (const e of entries) {
          const d = Math.round(e.duration ?? 0);
          if (d > inp) {
            inp = d;
            inpSource = 'inp';
          }
        }
      }),
      observe('first-input', (entries) => {
        if (inpSource === 'inp') return;
        const e = entries[0];
        if (!e) return;
        inp = Math.round((e.processingStart ?? 0) - (e.startTime ?? 0));
        inpSource = 'fid';
      }),
    ];

    let reported = false;
    const report = () => {
      if (reported) return;
      reported = true;
      observers.forEach((o) => {
        try {
          o?.disconnect();
        } catch {
          /* noop */
        }
      });

      try {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        const resources = performance.getEntriesByType('resource') as any[];
        const all = nav ? [nav as any, ...resources] : resources;
        const { buckets, totalKb, requests } = summarizeResources(all);
        const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
        const conn = (navigator as any).connection;

        void import('./diagnosticLogger').then(({ logPerformance }) => {
          logPerformance('landing_page_load', nav ? nav.loadEventEnd - nav.startTime : lcp, {
            lcp_ms: lcp,
            lcp_element: lcpTarget,
            cls: Number(cls.toFixed(4)),
            inp_ms: inp,
            inp_source: inpSource,
            fcp_ms: Math.round(fcp),
            ttfb: nav ? Math.round(nav.responseStart - nav.startTime) : null,
            domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
            bytes: buckets,
            total_kb: totalKb,
            requests,
            is_fast_landing: isFastLanding,
            connection: conn?.effectiveType ?? null,
            save_data: conn?.saveData ?? null,
          });
        });
      } catch {
        /* never break the page for telemetry */
      }
    };

    const schedule = () => window.setTimeout(report, REPORT_DELAY_MS);
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });

    // Never lose the sample when the visitor bounces early.
    window.addEventListener('pagehide', report, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') report();
    });
  } catch {
    /* noop */
  }
};
