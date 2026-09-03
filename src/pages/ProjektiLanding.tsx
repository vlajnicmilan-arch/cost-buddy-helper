import { useEffect, useRef } from 'react';
import bodyHtml from './ProjektiLanding.body.html?raw';
import { useLandingTelemetry } from '@/hooks/useLandingTelemetry';
import { MODULE_HSL } from '@/lib/moduleColors';
import odluka from '@/assets/landing/odluka.png';
import sekcije from '@/assets/landing/sekcije.png';
import projekt from '@/assets/landing/projekt-kartica.png';
import budzet from '@/assets/landing/budzet.png';
import dnevnik from '@/assets/landing/dnevnik.png';
import trosak from '@/assets/landing/trosak.png';
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
  const renderedBody = bodyHtml
    .replace('__ODLUKA__', odluka)
    .replace('__SEKCIJE__', sekcije)
    .replace('__PROJEKT__', projekt)
    .replace('__BUDZET__', budzet)
    .replace('__DNEVNIK__', dnevnik)
    .replace('__TROSAK__', trosak);

  // Telemetrija: page_view, section_view, scroll_depth, cta_click,
  // time_on_page, page_ready. Jezik je fiksno hr; tema se čita s <html>.
  const theme =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light';
  useLandingTelemetry(containerRef, 'hr', theme);

  // Ljepljivi CTA na dnu — pojavi se kad glavni CTA izađe iz vidnog polja.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const hero = root.querySelector<HTMLElement>('.hero .cta');
    const bar = root.querySelector<HTMLElement>('#sticky');
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
          '--module-accent': MODULE_HSL.projects,
        } as React.CSSProperties
      }
      dangerouslySetInnerHTML={{ __html: renderedBody }}
    />
  );
}
