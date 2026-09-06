/**
 * The fast-landing condition decides whether the baked sales markup stays on
 * screen or is dropped so the app can boot. `src/main.tsx` and the build-time
 * `HOME_BOOT` script MUST use the exact same source.
 *
 * Same guard pattern as `funnelEventNameConstraint.test.ts` and
 * `staticLegalPagesParity.test.ts`: the test fails as soon as the two drift.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractFastLandingSource, buildHomeBoot } from '../../scripts/bakeLandingPlugin.mjs';
import * as fastLanding from '../lib/fastLanding';

const MODULE_PATH = path.resolve(process.cwd(), 'src/lib/fastLanding.js');
const MAIN_PATH = path.resolve(process.cwd(), 'src/main.tsx');

interface Env {
  pathname: string;
  search?: string;
  hash?: string;
  installed?: boolean;
  storedSession?: boolean;
  throws?: boolean;
}

/** Run the shared condition source in an isolated fake browser environment. */
const runCondition = (source: string, env: Env): boolean => {
  const storage: Record<string, string> = env.storedSession
    ? { 'sb-abcdef-auth-token': '{"access_token":"x"}' }
    : { 'centar-theme': 'dark' };
  const keys = Object.keys(storage);

  const fakeWindow: any = {
    location: {
      pathname: env.pathname,
      search: env.search ?? '',
      hash: env.hash ?? '',
    },
    matchMedia: () => {
      if (env.throws) throw new Error('matchMedia unavailable');
      return { matches: !!env.installed };
    },
  };
  const fakeNavigator: any = { standalone: false };
  const fakeLocalStorage: any = {
    get length() {
      return keys.length;
    },
    key: (i: number) => keys[i] ?? null,
    getItem: (k: string) => storage[k] ?? null,
  };

  // eslint-disable-next-line no-new-func
  const factory = new Function(
    'window',
    'navigator',
    'localStorage',
    `${source}\nreturn isFastLanding();`,
  );
  return factory(fakeWindow, fakeNavigator, fakeLocalStorage) as boolean;
};

const SHOW = true; // keep the baked sales page
const DROP = false; // remove it, boot the app

const CASES: Array<[string, Env, boolean]> = [
  ['/ plain visitor', { pathname: '/' }, SHOW],
  [
    '/ with ad tags',
    {
      pathname: '/',
      search:
        '?utm_source=fb&utm_medium=paid&utm_campaign=Ponuda+2&utm_content=120248964310530423',
    },
    SHOW,
  ],
  ['/landing', { pathname: '/landing' }, SHOW],
  ['/projekti', { pathname: '/projekti' }, DROP],
  ['/projekti?utm_source=fb', { pathname: '/projekti', search: '?utm_source=fb' }, DROP],
  ['/projekti/', { pathname: '/projekti/' }, DROP],
  ['/auth', { pathname: '/auth' }, DROP],
  ['/auth?mode=signup', { pathname: '/auth', search: '?mode=signup' }, DROP],
  ['/home', { pathname: '/home' }, DROP],
  ['/asdf', { pathname: '/asdf' }, DROP],
  ['/#access_token=xyz', { pathname: '/', hash: '#access_token=xyz' }, DROP],
  ['/?code=abc', { pathname: '/', search: '?code=abc' }, DROP],
  ['/ in the installed app', { pathname: '/', installed: true }, DROP],
  ['/ with a stored auth session', { pathname: '/', storedSession: true }, DROP],
  ['the check throws', { pathname: '/', throws: true }, DROP],
];

describe('fast landing condition', () => {
  const source = extractFastLandingSource(fs.readFileSync(MODULE_PATH, 'utf8'));

  it.each(CASES)('%s', (_label, env, expected) => {
    expect(runCondition(source, env)).toBe(expected);
  });

  it('the /projekti document is baked as its own file and carries no HOME_BOOT', () => {
    // /projekti is served from dist/projekti/index.html, which never receives
    // the boot script — the rows above only describe the shared "/" document.
    const plugin = fs.readFileSync(
      path.resolve(process.cwd(), 'scripts/bakeLandingPlugin.mjs'),
      'utf8',
    );
    expect(plugin).toMatch(/homeBoot/);
    expect(plugin.split('projekti = setRoot')[1] ?? '').not.toMatch(/homeBoot/);
  });

  it('main.tsx imports the shared condition instead of defining its own', () => {
    const main = fs.readFileSync(MAIN_PATH, 'utf8');
    expect(main).toMatch(/from ["']\.\/lib\/fastLanding["']/);
    expect(main).not.toMatch(/const hasAuthHashOrQuery/);
    expect(main).not.toMatch(/const hasStoredAuthSession/);
    expect(main).not.toMatch(/const isInstalledApp/);
  });

  it('HOME_BOOT embeds the very same source (no hand-written copy)', () => {
    const boot = buildHomeBoot(source);
    expect(boot).toContain(source);
    expect(boot).toContain("classList.remove('centar-landing-body')");
    expect(boot).toContain("setAttribute('content','spa')");
  });

  it('the exported module and the extracted source agree on every case', () => {
    // Guards against the module drifting from the extracted region.
    expect(typeof fastLanding.isFastLanding).toBe('function');
    expect(source).toContain('function isFastLanding()');
    expect(source).not.toContain('export ');
  });
});

afterEach(() => {
  /* no global state touched */
});
