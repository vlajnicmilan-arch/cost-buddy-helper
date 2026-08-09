import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Guard: the Onyx (premium-dark) surface/border calibration must stay inside
 * the .business-theme-premium-dark block and must keep the card visually
 * separated from the background.
 */

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

const ONYX_SELECTOR = '.business-theme-premium-dark,';

function extractOnyxBlock(): string {
  const start = css.indexOf(ONYX_SELECTOR);
  expect(start).toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error('Onyx block not terminated');
}

function hsl(block: string, token: string): [number, number, number] {
  const match = new RegExp(`${token}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`).exec(block);
  expect(match, `${token} not found`).toBeTruthy();
  return [Number(match![1]), Number(match![2]), Number(match![3])];
}

describe('Onyx theme tokens', () => {
  const block = extractOnyxBlock();

  it('card surface sits a visible step above the background', () => {
    const [, , bgL] = hsl(block, '--background');
    const [, , cardL] = hsl(block, '--card');
    expect(cardL - bgL).toBeGreaterThanOrEqual(3);
    expect(cardL).toBeLessThanOrEqual(12);
  });

  it('popover stays at or above the card surface', () => {
    expect(hsl(block, '--popover')[2]).toBeGreaterThanOrEqual(hsl(block, '--card')[2]);
  });

  it('border is lifted above the card and warmed toward the primary hue', () => {
    const [borderH, borderS, borderL] = hsl(block, '--border');
    const [primaryH] = hsl(block, '--primary');
    expect(borderL).toBeGreaterThanOrEqual(hsl(block, '--card')[2] + 10);
    expect(Math.abs(borderH - primaryH)).toBeLessThanOrEqual(10);
    // warmth only — never a gold frame
    expect(borderS).toBeLessThanOrEqual(30);
  });

  it('input matches the border token', () => {
    expect(hsl(block, '--input')).toEqual(hsl(block, '--border'));
  });

  it('keeps the per-card glow system and semantic tokens untouched', () => {
    expect(block).toContain('--card-glow: oklch(from hsl(var(--card-accent, 40 55% 48%)) 0.84 c h)');
    expect(block).toContain('--document-pending: 40 55% 52%');
    expect(block).not.toContain('--income');
    expect(block).not.toContain('--expense');
  });

  it('does not leak surface overrides into :root or .dark', () => {
    const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('.dark {'));
    expect(rootBlock).not.toContain('30 7% 9%');
    const darkStart = css.indexOf('\n  .dark {');
    const darkBlock = css.slice(darkStart, darkStart + 4000);
    expect(darkBlock).not.toContain('40 18% 26%');
  });
});
