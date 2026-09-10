import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordLandingAuthSource, readAuthEntry } from '@/lib/authFunnel';

describe('recordLandingAuthSource', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
  });

  it('records /projekti attribution for ?src=projekti', () => {
    recordLandingAuthSource('?src=projekti');
    const entry = readAuthEntry();
    expect(entry.entry_path).toBe('/projekti');
    expect(entry.entry_cta).toBe('landing_projekti');
    expect(entry.entry_at).toBeGreaterThan(0);
  });

  it('records home attribution for ?src=home', () => {
    recordLandingAuthSource('?src=home');
    const entry = readAuthEntry();
    expect(entry.entry_path).toBe('/');
    expect(entry.entry_cta).toBe('landing_home');
  });

  it('ignores unknown src values', () => {
    recordLandingAuthSource('?src=unknown');
    expect(readAuthEntry()).toEqual({});
  });

  it('is a no-op when src is absent', () => {
    recordLandingAuthSource('');
    expect(readAuthEntry()).toEqual({});
    recordLandingAuthSource('?mode=signup');
    expect(readAuthEntry()).toEqual({});
  });

  it('works alongside other query parameters', () => {
    recordLandingAuthSource('?mode=signup&src=projekti&utm_source=fb');
    const entry = readAuthEntry();
    expect(entry.entry_path).toBe('/projekti');
    expect(entry.entry_cta).toBe('landing_projekti');
  });
});
