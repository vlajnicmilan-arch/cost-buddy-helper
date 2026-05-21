import { useEffect } from 'react';
import { logDashboardScrollDepth } from '@/lib/dashboardTelemetry';

/**
 * Tracks scroll depth on window — fires once per threshold per session
 * (25/50/75/100). Mount on the dashboard route only.
 */
export const useDashboardScrollDepth = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    let ticking = false;
    const handle = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const doc = document.documentElement;
        const scrollTop = window.scrollY || doc.scrollTop;
        const viewport = window.innerHeight;
        const total = doc.scrollHeight - viewport;
        if (total <= 0) return;
        const pct = Math.min(100, Math.round((scrollTop / total) * 100));
        if (pct >= 100) logDashboardScrollDepth(100);
        else if (pct >= 75) logDashboardScrollDepth(75);
        else if (pct >= 50) logDashboardScrollDepth(50);
        else if (pct >= 25) logDashboardScrollDepth(25);
      });
    };
    window.addEventListener('scroll', handle, { passive: true });
    handle();
    return () => window.removeEventListener('scroll', handle);
  }, [enabled]);
};
