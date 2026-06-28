/**
 * Onboarding copy & celebration regression test.
 *
 * Lock contract from D1 ("Spremni smo" ekran uklonjen) i mem://features/onboarding-strategy:
 *  - StepReady.tsx više NE smije postojati (D1).
 *  - Step 1 (StepGreeting) MORA sadržavati brevity hint.
 *  - i18n MORA imati onboardingV3.startCta (D1 CTA "Krenimo").
 *  - i18n NE smije više sadržavati onboardingV3.ready.* ključeve.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('onboarding copy contract', () => {
  describe('StepReady removal (D1)', () => {
    it('StepReady.tsx no longer exists', () => {
      expect(existsSync(resolve(process.cwd(), 'src/components/onboarding/steps/StepReady.tsx'))).toBe(false);
    });

    it('Onboarding.tsx does not import StepReady', () => {
      const src = read('src/pages/Onboarding.tsx');
      expect(src).not.toMatch(/StepReady/);
    });
  });

  describe('StepGreeting', () => {
    const src = read('src/components/onboarding/steps/StepGreeting.tsx');

    it('includes the brevity hint key', () => {
      expect(src).toMatch(/onboardingV3\.greeting\.brevityHint/);
    });
  });

  describe('i18n', () => {
    for (const path of ['src/i18n/locales/hr.json', 'src/i18n/locales/en.json', 'src/i18n/locales/de.json']) {
      it(`${path} has startCta and no ready.*`, () => {
        const json = JSON.parse(read(path));
        const v3 = json?.onboardingV3 ?? {};
        expect(typeof v3.startCta).toBe('string');
        expect(v3.startCta.length).toBeGreaterThan(0);
        expect(v3.ready).toBeUndefined();
      });
    }
  });
});
