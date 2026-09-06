import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRenderMode } from '@/lib/landingRenderMode';

describe('resolveRenderMode', () => {
  it('reports baked only when the marker matches the current path', () => {
    expect(resolveRenderMode({ content: 'baked', path: '/projekti' }, '/projekti')).toBe('baked');
    expect(resolveRenderMode({ content: 'baked', path: '/' }, '/')).toBe('baked');
  });

  it('reports spa after a client-side navigation away from the baked path', () => {
    expect(resolveRenderMode({ content: 'baked', path: '/' }, '/projekti')).toBe('spa');
  });

  it('reports spa without a marker', () => {
    expect(resolveRenderMode(null, '/')).toBe('spa');
    expect(resolveRenderMode({ content: null, path: null }, '/')).toBe('spa');
  });

  it('ignores trailing slash, case and query', () => {
    expect(resolveRenderMode({ content: 'baked', path: '/projekti' }, '/Projekti/')).toBe('baked');
  });
});

describe('baking guardrails', () => {
  it('never ships a hand-written landing HTML file in public/', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      );
    const htmls = walk(resolve(process.cwd(), 'public'))
      .filter((p) => p.endsWith('.html'))
      .map((p) => p.replace(/.*\/public\//, ''));
    // Only the two legal documents are allowed to live in public/ as files.
    expect(htmls.sort()).toEqual(['privacy-policy/index.html', 'refund-policy/index.html']);
  });

  it('keeps every landing CTA a plain link so early clicks still navigate', () => {
    const bodies = [
      'src/pages/CentarLanding.body.html',
      'src/pages/CentarLanding.body.en.html',
      'src/pages/CentarLanding.body.de.html',
      'src/pages/ProjektiLanding.body.html',
    ];
    bodies.forEach((p) => {
      const html = readFileSync(resolve(process.cwd(), p), 'utf8');
      const ctas = html.match(/<[a-z]+[^>]*data-telemetry-target="[^"]*cta[^"]*"[^>]*>/g) ?? [];
      expect(ctas.length).toBeGreaterThan(0);
      ctas.forEach((tag) => {
        expect(tag.startsWith('<a ')).toBe(true);
        expect(tag).toMatch(/href="\/[^"]*"/);
      });
    });
  });
});
