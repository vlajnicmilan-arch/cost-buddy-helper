import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/**
 * ČUVAR VODORAVNOG PRELJEVA: zaglavlje ekrana Projekti u biznis modu ne smije
 * na uskim ekranima gurati gumb "Novi" izvan ekrana.
 *
 * Uzrok kvara: unutarnji div s gumbima imao je `flex items-center gap-2` BEZ
 * `flex-wrap`, pa se pet gumba nije lomilo nego je prelijevalo preko desnog
 * ruba ekrana i clipalo se.
 */
describe('BusinessProjects header — horizontal overflow guard', () => {
  const src = read('src/components/business/BusinessProjects.tsx');

  it('outer header row wraps and constrains width', () => {
    expect(src).toMatch(/className="flex items-center justify-between gap-2 flex-wrap w-full min-w-0 overflow-x-hidden"/);
  });

  it('inner button container wraps instead of overflowing', () => {
    expect(src).toMatch(/className="flex flex-wrap items-center gap-2 w-full min-w-0 sm:w-auto"/);
  });

  it('header does not contain a non-wrapping button row', () => {
    const headerMatch = src.match(/\{\/\* Header \*\/\}[\s\S]*?\{\/\* Project List \*\/\}/);
    expect(headerMatch).toBeTruthy();
    const headerSection = headerMatch?.[0] ?? '';
    expect(headerSection).not.toMatch(/<div className="flex items-center gap-2">/);
  });

  it('title can shrink instead of pushing buttons', () => {
    expect(src).toMatch(/<h2 className="text-lg font-semibold flex items-center gap-2 min-w-0">/);
    expect(src).toMatch(/<span className="truncate">\{t\('nav\.projects', 'Projekti'\)\}<\/span>/);
  });

  it('all action buttons can shrink and truncate labels', () => {
    const buttons = src.match(/<Button[\s\S]*?<\/Button>/g) ?? [];
    const shrinkable = buttons.filter((b) => b.includes('min-w-0') && b.includes('truncate'));
    expect(shrinkable.length).toBeGreaterThanOrEqual(4);
  });

  it('"Novi" button is always visible and prominent', () => {
    expect(src).toMatch(/className="gap-1\.5 rounded-xl shrink-0 order-first sm:order-last"/);
    expect(src).toMatch(/<span className="truncate">\{t\('projects\.new', 'Novi'\)\}<\/span>/);
  });

  it('icons inside buttons do not shrink', () => {
    const shrinkIcons = src.match(/className="w-4 h-4 shrink-0"/g) ?? [];
    expect(shrinkIcons.length).toBeGreaterThanOrEqual(4);
  });
});
