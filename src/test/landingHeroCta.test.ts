import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describeAnchorClick } from '@/lib/landingTelemetry';

const BODIES = [
  'src/pages/CentarLanding.body.html',
  'src/pages/CentarLanding.body.en.html',
  'src/pages/CentarLanding.body.de.html',
];

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('landing hero CTA', () => {
  it('emits cta_click with the hero_cta target regardless of button copy', () => {
    const d = describeAnchorClick({
      href: '/auth?mode=signup',
      className: 'btn btn-primary',
      text: 'Isprobaj besplatno →',
      telemetryTarget: 'hero_cta',
    });
    expect(d).toEqual({ eventType: 'cta_click', target: 'hero_cta', href: '/auth?mode=signup' });
  });

  it('falls back to the text slug when no explicit target is set', () => {
    const d = describeAnchorClick({ href: '/x', className: 'btn', text: 'Preuzmi za Android' });
    expect(d?.target).toBe('preuzmi-za-android');
  });

  it('every language body carries the hero CTA pointing at signup', () => {
    BODIES.forEach((p) => {
      const html = read(p);
      expect(html).toContain('data-telemetry-target="hero_cta"');
      const cta = html.match(/<a[^>]*data-telemetry-target="hero_cta"[^>]*>/)?.[0] ?? '';
      expect(cta).toContain('href="/auth?mode=signup"');
      expect(cta).toContain('btn-primary');
    });
  });

  it('never claims a 30-day trial in the hero', () => {
    BODIES.forEach((p) => {
      const hero = read(p).split('<!-- HERO -->')[0];
      expect(hero).not.toMatch(/30\s*(dana|days|Tage)/i);
    });
  });

  it('keeps the Croatian hero note literal and the story untouched', () => {
    const html = read(BODIES[0]);
    expect(html).toContain('Račun je besplatan. Bez roka i bez kartice.');
    expect(html).toContain('Jedan projekt.<br><span class="split">Dva odvojena sjećanja.</span>');
  });
});
