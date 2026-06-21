/**
 * Onboarding copy & celebration regression test.
 *
 * Locks the contract from `mem://features/onboarding-strategy`:
 *  - Step 2 (StepReady) MUST NOT import `react-confetti`
 *  - Step 2 MUST NOT reintroduce the setup checklist (`hasIncome` / `expenseCategoriesCount` props or `ready.budget|cats|income` keys)
 *  - Step 1 (StepGreeting) MUST include the brevity hint
 *  - i18n `ready.title` MUST NOT claim that something was "set up" / "spremna" / "bereit ist"
 *
 * If this test fails, do NOT loosen the assertion — re-read the memory doc;
 * the regression is the bug.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('onboarding copy contract', () => {
  describe('StepReady', () => {
    const src = read('src/components/onboarding/steps/StepReady.tsx');

    it('does not import react-confetti', () => {
      expect(src).not.toMatch(/react-confetti/);
    });

    it('does not accept hasIncome or expenseCategoriesCount props', () => {
      expect(src).not.toMatch(/hasIncome/);
      expect(src).not.toMatch(/expenseCategoriesCount/);
    });

    it('does not reference deprecated checklist i18n keys', () => {
      expect(src).not.toMatch(/onboardingV3\.ready\.(budget|cats|income)/);
    });
  });

  describe('StepGreeting', () => {
    const src = read('src/components/onboarding/steps/StepGreeting.tsx');

    it('includes the brevity hint key', () => {
      expect(src).toMatch(/onboardingV3\.greeting\.brevityHint/);
    });
  });

  describe('i18n ready.title', () => {
    const forbiddenSubstrings: Record<string, string[]> = {
      'src/i18n/locales/hr.json': ['aplikacija je spremna', 'Sve je postavljeno'],
      'src/i18n/locales/en.json': ['app is ready', 'Everything is set up'],
      'src/i18n/locales/de.json': ['App ist bereit', 'Alles ist eingerichtet'],
    };

    for (const [path, banned] of Object.entries(forbiddenSubstrings)) {
      it(`${path} does not claim setup completion`, () => {
        const json = JSON.parse(read(path));
        const ready = json?.onboardingV3?.ready ?? {};
        const blob = JSON.stringify(ready);
        for (const s of banned) {
          expect(blob).not.toContain(s);
        }
      });
    }
  });
});
