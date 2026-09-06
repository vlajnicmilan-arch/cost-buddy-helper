/**
 * BRANA: statičke pravne stranice u `public/` zasjenjuju React rute na
 * produkciji (poslužitelj vraća datoteku, ruta se nikad ne izvrši). Ako se
 * React komponenta promijeni, a statička datoteka ne, javno stoji zastarjeli
 * pravni dokument.
 *
 * Isti obrazac kao `funnelEventNameConstraint.test.ts`: dva popisa istog
 * sadržaja moraju se poklapati, a test pada čim se raziđu.
 *
 * Minimum: oznaka verzije i datum. Uz to se provjeravaju i ključni dijelovi
 * teksta (sub-procesori, rokovi čuvanja, nazivi modula, kontakti).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...p: string[]): string => readFileSync(join(process.cwd(), ...p), 'utf8');

/** Vidljivi tekst statičke HTML datoteke, s normaliziranim razmacima. */
const staticText = (path: string[]): string => {
  const html = read(...path);
  const body = html.slice(html.indexOf('<body>'));
  return body
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
};

/** Vrijednost jednog stringovnog polja iz HR objekta React komponente. */
const hrField = (src: string, field: string): string => {
  const hrStart = src.indexOf('const HR:');
  expect(hrStart).toBeGreaterThan(-1);
  const block = src.slice(hrStart, src.indexOf('\n};', hrStart));
  const m = block.match(new RegExp(`\\n  ${field}:\\s*\\n?\\s*'((?:[^'\\\\]|\\\\.)*)'`));
  expect(m, `polje ${field} nije pronađeno`).toBeTruthy();
  return m![1].replace(/\\'/g, "'");
};

/** Svi stringovi iz imenovanog polja (array literal) unutar HR objekta. */
const hrArrayStrings = (src: string, field: string): string[] => {
  const hrStart = src.indexOf('const HR:');
  const block = src.slice(hrStart, src.indexOf('\n};', hrStart));
  const start = block.indexOf(`\n  ${field}: [`);
  if (start < 0) return [];
  const end = block.indexOf('\n  ],', start);
  return Array.from(block.slice(start, end).matchAll(/'((?:[^'\\]|\\.)*)'/g)).map((m) =>
    m[1].replace(/\\'/g, "'"),
  );
};

describe('statička /privacy-policy ↔ src/pages/PrivacyPolicy.tsx', () => {
  const src = read('src', 'pages', 'PrivacyPolicy.tsx');
  const text = staticText(['public', 'privacy-policy', 'index.html']);

  it('oznaka verzije i datum su identični', () => {
    expect(text).toContain(hrField(src, 'version'));
  });

  it('naslov dokumenta je identičan', () => {
    expect(text).toContain(hrField(src, 'title'));
  });

  it('svi sub-procesori iz komponente postoje u statičkoj datoteci', () => {
    const hrStart = src.indexOf('const HR:');
    const block = src.slice(hrStart, src.indexOf('\n};', hrStart));
    const spStart = block.indexOf('subProcessors: [');
    const spEnd = block.indexOf('\n  s4Outro:', spStart);
    const names = Array.from(
      block.slice(spStart, spEnd).matchAll(/name:\s*'((?:[^'\\]|\\.)*)'/g),
    ).map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((n) => !text.includes(n))).toEqual([]);
  });

  it('svi rokovi čuvanja iz komponente postoje u statičkoj datoteci', () => {
    const hrStart = src.indexOf('const HR:');
    const block = src.slice(hrStart, src.indexOf('\n};', hrStart));
    const rStart = block.indexOf('retention: [');
    const rEnd = block.indexOf('\n  ],', rStart);
    const rows = Array.from(
      block.slice(rStart, rEnd).matchAll(/category:\s*'((?:[^'\\]|\\.)*)',\s*period:\s*'((?:[^'\\]|\\.)*)'/g),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter(([, c]) => !text.includes(c)).map(([, c]) => c)).toEqual([]);
    expect(rows.filter(([, , p]) => !text.includes(p)).map(([, , p]) => p)).toEqual([]);
  });

  it('kategorije poslovnih podataka (nazivi modula) su identične', () => {
    const items = hrArrayStrings(src, 's2_2');
    expect(items.length).toBeGreaterThan(0);
    expect(items.filter((i) => !text.includes(i))).toEqual([]);
  });

  it('sigurnosne mjere su identične', () => {
    const items = hrArrayStrings(src, 's7');
    expect(items.length).toBeGreaterThan(0);
    expect(items.filter((i) => !text.includes(i))).toEqual([]);
  });

  it('odjeljak o AI odlučivanju je identičan', () => {
    expect(text).toContain(hrField(src, 's10p1'));
  });

  it('kontaktne adrese iz komponente postoje u statičkoj datoteci', () => {
    const html = read('public', 'privacy-policy', 'index.html');
    for (const addr of ['privacy@vmbalance.com', 'gdpr@vmbalance.com', 'security@vmbalance.com']) {
      expect(src).toContain(addr);
      expect(html).toContain(addr);
    }
  });
});

describe('statička /refund-policy ↔ src/pages/RefundPolicy.tsx', () => {
  const src = read('src', 'pages', 'RefundPolicy.tsx');
  const text = staticText(['public', 'refund-policy', 'index.html']);

  /** Vidljivi tekst JSX-a komponente, s normaliziranim razmacima. */
  const componentText = src
    .slice(src.indexOf('<div className="min-h-dvh'))
    .replace(/\{'\s*'\}/g, ' ')
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  it('oznaka verzije i datum su identični', () => {
    const version = componentText.match(/Verzija [0-9.]+ — [^<]*?2026\./)?.[0];
    expect(version, 'verzija nije pronađena u komponenti').toBeTruthy();
    expect(text).toContain(version!);
  });

  it('svaka rečenica iz komponente postoji u statičkoj datoteci', () => {
    const sentences = componentText
      .split(/(?<=\.)\s+/)
      .map((s) => s.trim())
      .filter((s) => s.split(' ').length > 6);
    expect(sentences.length).toBeGreaterThan(4);
    expect(sentences.filter((s) => !text.includes(s))).toEqual([]);
  });
});
