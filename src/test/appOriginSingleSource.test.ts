import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * GUARD: every absolute link INTO THE APP must come from one place.
 *
 *  - frontend: src/lib/appOrigin.ts
 *  - edge functions: supabase/functions/_shared/appUrl.ts
 *
 * A literal `https://vmbalance.com` followed by an app path anywhere else in
 * `src/` or `supabase/functions/` fails this test.
 */

const ROOT = join(__dirname, '..', '..');
const SCAN_DIRS = ['src', 'supabase/functions'];
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

// Literal app origin + an app route.
const APP_PATHS = [
  'auth',
  'app',
  'home',
  'admin',
  'help',
  'join-project',
  'join-budget',
  'p',
  'native-oauth',
  'setup',
];
const LITERAL = new RegExp(
  `https://(?:www\\.)?vmbalance\\.com/(?:${APP_PATHS.join('|')})(?:[/?#'"\`\\s]|$)`,
);

/** Files allowed to contain the literal, each with the reason. */
const ALLOWLIST: Record<string, string> = {
  // The single source of truth itself (fallback value lives here).
  'src/lib/appOrigin.ts': 'helper — holds DEFAULT_APP_ORIGIN fallback',
  'supabase/functions/_shared/appUrl.ts': 'helper — holds DEFAULT_APP_URL fallback',
  // This guard test states the literal on purpose.
  'src/test/appOriginSingleSource.test.ts': 'the guard itself',
  // Landing/marketing tooling — explicitly out of scope (SEO canonical, baked landing).
  'scripts/bakeLandingPlugin.mjs': 'marketing landing SEO metadata, not an app link',
  // Existing test fixtures that simulate a browser location.
  'src/test/vitePreloadErrorRecovery.test.ts': 'test fixture simulating window.location',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

describe('app origin single source of truth', () => {
  it('has no hardcoded absolute app links outside the helpers', () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file).split('\\').join('/');
        if (ALLOWLIST[rel]) continue;
        const content = readFileSync(file, 'utf8');
        content.split('\n').forEach((line, i) => {
          if (LITERAL.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('allowlist documents a reason for every exemption', () => {
    for (const [file, reason] of Object.entries(ALLOWLIST)) {
      expect(reason.length, file).toBeGreaterThan(10);
    }
  });
});
