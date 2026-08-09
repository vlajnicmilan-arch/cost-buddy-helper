/**
 * ČUVAR: svako upozorenje koje worker emitira mora imati ljudsku rečenicu na
 * hr/en/de. Bez ovoga korisnik na ekranu vidi sirovi ključ (npr.
 * "vise_kandidata_iban") — točno kvar prijavljen 08.08.2026.
 *
 * Skenira konstante `*_WARNING` i `warnings.push('...')` literale u
 * supabase/functions/**, pa provjerava mailReview.warning.<key> u sva tri
 * master rječnika.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import hr from '../i18n/locales/hr.json';
import en from '../i18n/locales/en.json';
import de from '../i18n/locales/de.json';

const FUNCTIONS_DIR = path.resolve(__dirname, '../../supabase/functions');

const CATALOGS: Record<'hr' | 'en' | 'de', Record<string, string>> = {
  hr: (hr as any).mailReview?.warning ?? {},
  en: (en as any).mailReview?.warning ?? {},
  de: (de as any).mailReview?.warning ?? {},
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

// export const X_WARNING = 'kljuc';  |  warnings.push('kljuc')
const CONST_RE = /[A-Z0-9_]*WARNING[A-Z0-9_]*\s*=\s*['"]([a-z0-9_]+)['"]/g;
const PUSH_RE = /warnings\.push\(\s*['"]([a-z0-9_]+)['"]\s*\)/g;

function collectWarnings(): string[] {
  const keys = new Set<string>();
  for (const file of walk(FUNCTIONS_DIR)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(CONST_RE)) keys.add(m[1]);
    for (const m of src.matchAll(PUSH_RE)) keys.add(m[1]);
  }
  return [...keys].sort();
}

const USED = collectWarnings();

describe('prijevodi upozorenja mail uvoza', () => {
  it('skupljen netrivijalan skup upozorenja', () => {
    expect(USED.length).toBeGreaterThan(2);
  });

  for (const lang of ['hr', 'en', 'de'] as const) {
    it(`${lang}.json ima rečenicu za svako upozorenje`, () => {
      const missing = USED.filter((k) => !CATALOGS[lang][k]);
      expect(
        missing,
        `Nedostaje mailReview.warning.{${missing.join(', ')}} u src/i18n/locales/${lang}.json — ` +
          `korisnik bi vidio sirovi ključ.`,
      ).toEqual([]);
    });
  }
});
