import { useEffect, useRef } from 'react';
import { logDashboardView, logDashboardClick } from '@/lib/dashboardTelemetry';

interface Props {
  name: string;
  children: React.ReactNode;
  /** When true, emit section_click for any click within children. */
  trackClicks?: boolean;
  className?: string;
}

/**
 * Wrapper that emits a `section_view` event when first ≥50% visible
 * (deduped per session per section), and optionally `section_click` events.
 */
export const TrackSection = ({ name, children, trackClicks = true, className }: Props) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      logDashboardView(name);
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          logDashboardView(name);
          obs.disconnect();
          break;
        }
      }
    }, { threshold: [0.5] });
    obs.observe(el);
    return () => obs.disconnect();
  }, [name]);

  const onClickCapture = trackClicks
    ? () => logDashboardClick(name)
    : undefined;

  return (
    <div ref={ref} className={className} onClickCapture={onClickCapture}>
      {children}
    </div>
  );
};
