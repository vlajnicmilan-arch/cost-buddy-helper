import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS_PATH = 'src/pages/CentarLanding.css';

/**
 * Selectors allowed to keep a hardcoded white text color, because they always
 * sit on a dark background regardless of the active theme.
 */
const ALLOWED_SELECTOR_PARTS = [
  '.btn-primary', // text on the blue accent button
  '.centar-lightbox-close', // close button on the dark lightbox overlay
  '.shot::after', // zoom badge on rgba(0,0,0,.55)
];

export interface WhiteTextViolation {
  line: number;
  selector: string;
  text: string;
}

/** Finds every hardcoded white *text* color outside the allowed selectors. */
export function findWhiteTextViolations(css: string): WhiteTextViolation[] {
  const lines = css.split('\n');
  const violations: WhiteTextViolation[] = [];
  let selector = '';

  lines.forEach((line, index) => {
    const braceIndex = line.indexOf('{');
    if (braceIndex >= 0) selector = line.slice(0, braceIndex).trim() || selector;

    if (!/color\s*:\s*#(fff|ffffff)\b/i.test(line)) return;
    if (ALLOWED_SELECTOR_PARTS.some((part) => selector.includes(part))) return;

    violations.push({ line: index + 1, selector, text: line.trim() });
  });

  return violations;
}

describe('CentarLanding.css — no hardcoded white text', () => {
  it('uses var(--text) instead of #fff for text colors', () => {
    const css = readFileSync(resolve(process.cwd(), CSS_PATH), 'utf8');
    const violations = findWhiteTextViolations(css);

    const message = violations
      .map(
        (v) =>
          `${CSS_PATH}:${v.line} — "${v.selector}" has a hardcoded white text color (${v.text}). ` +
          'Use var(--text) so the light theme works through tokens.',
      )
      .join('\n');

    expect(message).toBe('');
  });

  it('detects a reintroduced white text rule', () => {
    const violations = findWhiteTextViolations(
      '.centar-landing .pname{font-weight:600;color:#fff}\n',
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].selector).toContain('.pname');
  });

  it('keeps the documented exceptions passing', () => {
    const violations = findWhiteTextViolations(
      '.centar-landing .btn-primary{background:var(--accent);color:#fff}\n' +
        '.centar-lightbox-close{\n  color:#fff;cursor:pointer;\n}\n',
    );
    expect(violations).toEqual([]);
  });
});
