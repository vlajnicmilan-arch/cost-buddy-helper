import { useEffect } from 'react';
import {
  armLandingExitFlush,
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
        const th = scrollThreshold(pct);
        if (th) logLandingScroll(th);
      });
    };

    const onHide = () => {
      logLandingTimeOnPage(Math.round((Date.now() - startedAt) / 1000));
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
          if (label) logLandingSectionView(label);
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
      if (d) logLandingClick(d);
    };

    root.addEventListener('click', onClick, true);

    return () => {
      io.disconnect();
      root.removeEventListener('click', onClick, true);
      sections.forEach((el) => el.removeAttribute('data-tel-section'));
    };
  }, [rootRef, lang]);
};
