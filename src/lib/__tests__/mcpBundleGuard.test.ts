/**
 * STRAŽA — MCP bundle mora ostati zapakiravan (publish gate).
 *
 * Kvar 2.–7.8.2026: MCP alat je uvezao `@/lib/countedExpense` preko Vite
 * aliasa; ekstraktor ga je prepisao u `npm:@/lib/countedExpense`, Deno to
 * nije mogao razriješiti i publish je tiho padao ČETIRI dana — bez ijednog
 * deployment ID-a.
 *
 * Tri razine obrane:
 *   1) ESLint (`no-restricted-imports` u eslint.config.js) — blokira alias u izvoru.
 *   2) Ovaj test — blokira `npm:@/` u generiranoj datoteci.
 *   3) Ovaj test — validira SVE specifikatore i zdravlje bundlea.
 *
 * Napomena o opsegu: puni Deno bundle (`deno bundle`/`deno check`) ovdje se NE
 * pokreće — zahtijeva mrežni dohvat npm/jsr ovisnosti i traje predugo za
 * redovni vitest ciklus u CI-ju. Umjesto tihog preskakanja radimo najbližu
 * izvedivu varijantu: statičku analizu generirane datoteke (svi import
 * specifikatori moraju biti valjani `npm:` / `jsr:` / `node:` / relativni /
 * https URL) + provjeru da je sadržaj alata stvarno ušao u bundle.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const BUNDLE = join(ROOT, 'supabase/functions/mcp/index.ts');

const readBundle = (): string[] => readFileSync(BUNDLE, 'utf8').split('\n');

/** Izvlači sve statičke i dinamičke import specifikatore s brojem linije. */
const specifiers = (lines: string[]): Array<{ line: number; spec: string }> => {
  const out: Array<{ line: number; spec: string }> = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\bexport\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g,
  ];
  lines.forEach((text, i) => {
    for (const re of patterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) out.push({ line: i + 1, spec: m[1] });
    }
  });
  return out;
};

const VALID_SPEC = /^(npm:|jsr:|node:|https:\/\/|\.\/|\.\.\/|\/)/;

describe('MCP bundle guard', () => {
  it('generirana datoteka postoji', () => {
    expect(existsSync(BUNDLE)).toBe(true);
  });

  // ČUVAR 2 — rezultat: nijedan alias ne smije preživjeti do bundlea.
  it('ne sadrži nijedan `npm:@/` alias specifikator', () => {
    const offenders = readBundle()
      .map((text, i) => ({ line: i + 1, text }))
      .filter(({ text }) => text.includes('npm:@/'))
      .map(({ line, text }) => `supabase/functions/mcp/index.ts:${line}: ${text.trim()}`);

    expect(
      offenders,
      offenders.length
        ? `MCP ekstraktor je alias (@/...) prepisao u nevaljani npm:@/ specifikator. ` +
            `Deno ga ne može razriješiti i PUBLISH ĆE PASTI. ` +
            `Popravi IZVOR u src/lib/mcp/** (relativni import), ne generiranu datoteku:\n` +
            offenders.join('\n')
        : undefined,
    ).toEqual([]);
  });

  // ČUVAR 3 — zapakiravost: svi specifikatori valjani + sadržaj stvarno ušao.
  it('svi import specifikatori su valjani (npm:/jsr:/node:/https/relativni)', () => {
    const bad = specifiers(readBundle())
      .filter(({ spec }) => !VALID_SPEC.test(spec))
      .map(({ line, spec }) => `supabase/functions/mcp/index.ts:${line}: "${spec}"`);

    expect(
      bad,
      bad.length
        ? `Nevaljani specifikatori u MCP bundleu — Deno ih ne može razriješiti:\n${bad.join('\n')}`
        : undefined,
    ).toEqual([]);
  });

  it('sadržaj alata je stvarno inlinean u bundle (COUNTED_EXPENSE_STATUSES)', () => {
    const src = readFileSync(BUNDLE, 'utf8');
    expect(src).toMatch(/COUNTED_EXPENSE_STATUSES\s*=/);
    expect(src.includes('defineMcp')).toBe(true);
    expect(src.includes('Deno.serve')).toBe(true);
  });
});
