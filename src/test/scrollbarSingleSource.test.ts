import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(process.cwd(), 'src');
const ALLOWED_CSS = join('src', 'index.css');
const EXCLUDED = ['CentarLanding.css'];
const KEPT_CLASS = '.scrollbar-hide (definirana u src/index.css)';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('klizač — jedno rješenje kroz aplikaciju', () => {
  const files = walk(ROOT).filter(
    (f) => !EXCLUDED.some((e) => f.endsWith(e)) && !f.endsWith('scrollbarSingleSource.test.ts'),
  );

  it('nema klasa no-scrollbar / scrollbar-none', () => {
    const bad = files.filter((f) => /\b(no-scrollbar|scrollbar-none)\b/.test(readFileSync(f, 'utf8')));
    expect(
      bad,
      `Zabranjena klasa u: ${bad.join(', ')} — koristi ${KEPT_CLASS}`,
    ).toEqual([]);
  });

  it('nema tvrdo upisanih scrollbar varijanti u komponentama', () => {
    const bad = files
      .filter((f) => !f.endsWith('.css'))
      .filter((f) => {
        const s = readFileSync(f, 'utf8');
        return s.includes('[&::-webkit-scrollbar]') || s.includes('[scrollbar-width:');
      });
    expect(
      bad,
      `Tvrdo upisan scrollbar stil u: ${bad.join(', ')} — koristi ${KEPT_CLASS}`,
    ).toEqual([]);
  });

  it('::-webkit-scrollbar pravila postoje samo u src/index.css', () => {
    const bad = files.filter(
      (f) => !f.endsWith(ALLOWED_CSS) && readFileSync(f, 'utf8').includes('::-webkit-scrollbar'),
    );
    expect(
      bad,
      `Novo ::-webkit-scrollbar pravilo izvan src/index.css: ${bad.join(', ')} — koristi ${KEPT_CLASS}`,
    ).toEqual([]);
  });
});
