import { describe, it, expect, beforeEach } from 'vitest';
import {
  CAMPAIGN_SS_KEY,
  clearCampaign,
  loadCampaign,
  mergeCampaign,
  readCampaignFromParams,
  resolveInitialCycle,
  saveCampaign,
} from '@/lib/paywallCampaign';

// Minimal in-memory Storage shim for Node tests.
class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

let store: MemStorage;
beforeEach(() => {
  store = new MemStorage();
});

describe('paywallCampaign.readCampaignFromParams', () => {
  it('parses ?code= and ?cycle= together', () => {
    const p = new URLSearchParams('?code=FOUNDING100&cycle=yearly');
    expect(readCampaignFromParams(p)).toEqual({ code: 'FOUNDING100', cycle: 'yearly' });
  });
  it('trims code and treats whitespace-only as null', () => {
    expect(readCampaignFromParams(new URLSearchParams('?code=%20%20'))).toEqual({ code: null, cycle: null });
    expect(readCampaignFromParams(new URLSearchParams('?code=%20FOO%20'))).toEqual({ code: 'FOO', cycle: null });
  });
  it('rejects unknown cycle values', () => {
    expect(readCampaignFromParams(new URLSearchParams('?cycle=weekly')).cycle).toBeNull();
  });
});

describe('paywallCampaign sessionStorage survival', () => {
  it('save → load round-trip preserves code + cycle', () => {
    saveCampaign({ code: 'FOUNDING100', cycle: 'yearly' }, store);
    expect(store.getItem(CAMPAIGN_SS_KEY)).toBeTruthy();
    expect(loadCampaign(store)).toEqual({ code: 'FOUNDING100', cycle: 'yearly' });
  });
  it('does not persist an empty campaign', () => {
    saveCampaign({ code: null, cycle: null }, store);
    expect(store.getItem(CAMPAIGN_SS_KEY)).toBeNull();
  });
  it('clearCampaign removes the stored value', () => {
    saveCampaign({ code: 'X', cycle: null }, store);
    clearCampaign(store);
    expect(loadCampaign(store)).toEqual({ code: null, cycle: null });
  });
  it('load ignores corrupt JSON gracefully', () => {
    store.setItem(CAMPAIGN_SS_KEY, '{not-json');
    expect(loadCampaign(store)).toEqual({ code: null, cycle: null });
  });
});

describe('paywallCampaign.mergeCampaign', () => {
  it('URL takes precedence over storage', () => {
    expect(
      mergeCampaign({ code: 'NEW', cycle: 'monthly' }, { code: 'OLD', cycle: 'yearly' }),
    ).toEqual({ code: 'NEW', cycle: 'monthly' });
  });
  it('falls back to storage when URL is empty (auth-redirect recovery)', () => {
    expect(
      mergeCampaign({ code: null, cycle: null }, { code: 'FOUNDING100', cycle: 'yearly' }),
    ).toEqual({ code: 'FOUNDING100', cycle: 'yearly' });
  });
});

describe('paywallCampaign.resolveInitialCycle', () => {
  it('honours explicit ?cycle=', () => {
    expect(resolveInitialCycle({ code: 'X', cycle: 'monthly' })).toBe('monthly');
    expect(resolveInitialCycle({ code: null, cycle: 'yearly' })).toBe('yearly');
  });
  it('defaults to yearly when a code is present without explicit cycle', () => {
    expect(resolveInitialCycle({ code: 'FOUNDING100', cycle: null })).toBe('yearly');
  });
  it('defaults to monthly when nothing is provided', () => {
    expect(resolveInitialCycle({ code: null, cycle: null })).toBe('monthly');
  });
});
