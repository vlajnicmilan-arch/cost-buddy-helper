/**
 * Two guards on the baked home document:
 *  1. HOME_BOOT drops the markup ONLY when the condition says "not landing".
 *     A blocked/throwing `localStorage` must leave the page intact.
 *  2. RISE_BOOT reveals `.rise` blocks before the bundle mounts, with and
 *     without `IntersectionObserver`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractFastLandingSource, buildHomeBoot, RISE_BOOT } from '../../scripts/bakeLandingPlugin.mjs';

const source = extractFastLandingSource(
  fs.readFileSync(path.resolve(process.cwd(), 'src/lib/fastLanding.js'), 'utf8'),
);

const unwrap = (tag: string) => tag.replace(/^<script>/, '').replace(/<\/script>$/, '');

const setupDocument = () => {
  document.head.innerHTML = '<meta name="landing-render" content="baked" data-path="/">';
  document.body.className = 'centar-landing-body';
  document.body.innerHTML =
    '<div id="root"><div class="centar-landing" data-theme="dark"><div>' +
    '<section class="hero-lead">prvi ekran</section>' +
    '<section class="rise">a</section><section class="rise">b</section>' +
    '</div></div></div>';
};

const run = (code: string) => {
  // eslint-disable-next-line no-new-func
  new Function(code)();
};

let originalGetItem: typeof Storage.prototype.getItem;
let originalIO: typeof window.IntersectionObserver;

beforeEach(() => {
  originalGetItem = Storage.prototype.getItem;
  originalIO = window.IntersectionObserver;
  setupDocument();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  Storage.prototype.getItem = originalGetItem;
  window.IntersectionObserver = originalIO;
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  document.body.className = '';
});

describe('HOME_BOOT drop is bound to keep === false only', () => {
  it('keeps the baked home page when localStorage.getItem throws', () => {
    Storage.prototype.getItem = () => {
      throw new Error('storage blocked');
    };
    run(unwrap(buildHomeBoot(source)));

    expect(document.querySelector('.centar-landing')).not.toBeNull();
    expect(document.body.classList.contains('centar-landing-body')).toBe(true);
    expect(document.querySelector('meta[name="landing-render"]')?.getAttribute('content')).toBe('baked');
  });

  it('still drops the markup when the condition itself throws', () => {
    const broken = source.replace(
      'var path = window.location.pathname;',
      "throw new Error('boom');",
    );
    expect(broken).toContain("throw new Error('boom')");
    run(unwrap(buildHomeBoot(broken)));

    expect(document.getElementById('root')!.innerHTML).toBe('');
    expect(document.body.classList.contains('centar-landing-body')).toBe(false);
    expect(document.querySelector('meta[name="landing-render"]')?.getAttribute('content')).toBe('spa');
  });
});

describe('RISE_BOOT reveals the content below the first screen', () => {
  it('marks .rise elements as visible without the bundle (IntersectionObserver present)', () => {
    const observed: Element[] = [];
    class FakeIO {
      cb: (entries: Array<{ isIntersecting: boolean; target: Element }>) => void;
      constructor(cb: FakeIO['cb']) {
        this.cb = cb;
      }
      observe(el: Element) {
        observed.push(el);
        this.cb([{ isIntersecting: true, target: el }]);
      }
      unobserve() {}
      disconnect() {}
    }
    // @ts-expect-error test double
    window.IntersectionObserver = FakeIO;
    globalThis.IntersectionObserver = window.IntersectionObserver;

    run(unwrap(RISE_BOOT));

    expect(observed).toHaveLength(2);
    document.querySelectorAll('.rise').forEach((el) => {
      expect(el.classList.contains('in')).toBe(true);
    });
  });

  it('falls back to revealing everything when IntersectionObserver is missing', () => {
    delete (globalThis as Record<string, unknown>).IntersectionObserver;
    delete (window as unknown as Record<string, unknown>).IntersectionObserver;

    run(unwrap(RISE_BOOT));

    document.querySelectorAll('.rise').forEach((el) => {
      expect(el.classList.contains('in')).toBe(true);
    });
  });

  it('does nothing (and touches no network) when HOME_BOOT already emptied #root', () => {
    document.getElementById('root')!.innerHTML = '';
    run(unwrap(RISE_BOOT));
    expect(document.querySelectorAll('.rise')).toHaveLength(0);
    expect(RISE_BOOT).not.toContain('fetch');
  });

  it('is ES5: no arrows, templates or optional chaining', () => {
    expect(RISE_BOOT).not.toMatch(/=>/);
    expect(RISE_BOOT).not.toMatch(/`/);
    expect(RISE_BOOT).not.toMatch(/\?\./);
    expect(RISE_BOOT).toContain('prefers-reduced-motion:reduce');
  });
});
