import { useEffect, useRef } from 'react';
import bodyHtml from './ProjektiLanding.body.html?raw';
import { useLandingTelemetry } from '@/hooks/useLandingTelemetry';
import { MODULE_HSL } from '@/lib/moduleColors';
import './ProjektiLanding.css';

/**
 * ProjektiLanding — prodajna stranica modula Projekti na `/projekti`.
 *
 * Radi paralelno s postojećim landingom na `/` (koji se ne dira) kako bi se
 * mjerila razlika u konverziji. Ista telemetrija (`useLandingTelemetry`),
 * razlikuje se samo `path` u tablici `landing_events` (= `/projekti`).
 *
 * Stranica je zasad samo hrvatska i prati temu aplikacije (svijetla/tamna)
 * jer sve boje dolaze iz globalnih tokena — vidi ProjektiLanding.css.
 */
export default function ProjektiLanding() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Telemetrija: page_view, section_view, scroll_depth, cta_click,
  // time_on_page, page_ready. Jezik je fiksno hr; tema se čita s <html>.
  const theme =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light';
  useLandingTelemetry(containerRef, 'hr', theme);

  // Fontovi: Inter (tekst) + JetBrains Mono (iznosi, cijene, datumi).
  useEffect(() => {
    const links: HTMLLinkElement[] = [];
    const addLink = (attrs: Record<string, string>) => {
      const l = document.createElement('link');
      Object.entries(attrs).forEach(([k, v]) => l.setAttribute(k, v));
      document.head.appendChild(l);
      links.push(l);
    };
    addLink({ rel: 'preconnect', href: 'https://fonts.googleapis.com' });
    addLink({ rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' });
    addLink({
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap',
    });
    return () => links.forEach((l) => l.remove());
  }, []);

  // Ljepljivi CTA na dnu — pojavi se kad glavni CTA izađe iz vidnog polja.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const hero = root.querySelector<HTMLElement>('.phone .cta');
    const bar = root.querySelector<HTMLElement>('#projekti-sticky');
    if (!hero || !bar || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => bar.classList.toggle('on', !entries[0].isIntersecting),
      { rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="projekti-landing"
      lang="hr"
      style={
        {
          '--projects': MODULE_HSL.projects,
          // Lokalna iznimka: tamna tinta na tirkiznom gumbu (kontrast).
          // Globalni --primary-foreground ostaje netaknut.
          '--cta-ink': '172 45% 12%',
        } as React.CSSProperties
      }
      dangerouslySetInnerHTML={{ __html: bodyHtml }}
    />
  );
}
