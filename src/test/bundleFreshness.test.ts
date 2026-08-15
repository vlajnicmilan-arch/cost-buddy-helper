import { describe, it, expect } from 'vitest';
import {
  decideBundleAction,
  fetchLiveBuildSha,
  hasImportReviewWork,
  parseBuildSha,
} from '@/lib/bundleFreshness';

const base = { localSha: 'aaa', isBusy: false, documentHidden: false };

describe('parseBuildSha', () => {
  it('reads the build-sha meta', () => {
    expect(parseBuildSha('<meta name="build-sha" content="dev-123Z" />')).toBe('dev-123Z');
    expect(parseBuildSha('<meta content="dev-9Z" name="build-sha">')).toBe('dev-9Z');
    expect(parseBuildSha('<html></html>')).toBeNull();
  });
});

describe('decideBundleAction', () => {
  it('reloads on mismatch when calm', () => {
    expect(decideBundleAction({ ...base, liveSha: 'bbb' })).toBe('reload');
  });

  it('defers silently on mismatch while critical work is open', () => {
    expect(decideBundleAction({ ...base, liveSha: 'bbb', isBusy: true })).toBe('defer');
  });

  it('reloads once work is done', () => {
    expect(decideBundleAction({ ...base, liveSha: 'bbb', isBusy: false })).toBe('reload');
  });

  it('reloads a hidden tab immediately', () => {
    expect(decideBundleAction({ ...base, liveSha: 'bbb', isBusy: true, documentHidden: true })).toBe('reload');
  });

  it('does nothing when markers are equal (anti-loop after reload)', () => {
    expect(decideBundleAction({ ...base, liveSha: 'aaa' })).toBe('none');
    expect(decideBundleAction({ ...base, liveSha: 'aaa', isBusy: true, documentHidden: true })).toBe('none');
  });

  it('does nothing when the live marker is unknown (fetch failed)', () => {
    expect(decideBundleAction({ ...base, liveSha: null })).toBe('none');
  });
});

describe('fetchLiveBuildSha', () => {
  it('busts the cache and returns the live marker', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const sha = await fetchLiveBuildSha({
      fetchImpl: (async (url: string, init: RequestInit) => {
        seenUrl = url;
        seenInit = init;
        return { ok: true, text: async () => '<meta name="build-sha" content="dev-live">' };
      }) as unknown as typeof fetch,
      now: () => 42,
    });
    expect(sha).toBe('dev-live');
    expect(seenUrl).toBe('/index.html?bundle-check=42');
    expect(seenInit?.cache).toBe('no-store');
  });

  it('returns null silently when the fetch throws', async () => {
    const sha = await fetchLiveBuildSha({
      fetchImpl: (async () => { throw new Error('offline'); }) as unknown as typeof fetch,
    });
    expect(sha).toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    const sha = await fetchLiveBuildSha({
      fetchImpl: (async () => ({ ok: false, text: async () => '' })) as unknown as typeof fetch,
    });
    expect(sha).toBeNull();
  });
});

describe('hasImportReviewWork', () => {
  const makeStorage = (data: Record<string, string>) => ({
    getItem: (k: string) => data[k] ?? null,
    setItem: () => {},
    removeItem: () => {},
  });

  it('detects a parked import payload or draft', () => {
    expect(hasImportReviewWork(makeStorage({ 'vmb-import-review-payload:v1': '{}' }))).toBe(true);
    expect(hasImportReviewWork(makeStorage({ 'vmb-import-review-draft:v1': '{}' }))).toBe(true);
    expect(hasImportReviewWork(makeStorage({}))).toBe(false);
  });
});
