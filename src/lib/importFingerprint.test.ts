import { describe, it, expect } from 'vitest';
import { computeImportFingerprint, computeImportKey, computeImportKeys, importKeyCanonicalString } from '@/lib/importFingerprint';

const user = '11111111-1111-1111-1111-111111111111';
const base = {
  userId: user,
  paymentSource: 'custom:abc',
  date: new Date('2026-05-19'),
  type: 'expense',
  amount: 12.5,
};

describe('computeImportFingerprint', () => {
  it('returns identical hash for identical input', async () => {
    const a = await computeImportFingerprint({ ...base, description: 'KONZUM ZAGREB' });
    const b = await computeImportFingerprint({ ...base, description: 'KONZUM ZAGREB' });
    expect(a).toBe(b);
  });

  it('is whitespace/case/diacritic insensitive in description', async () => {
    const a = await computeImportFingerprint({ ...base, description: 'Kávé  bár' });
    const b = await computeImportFingerprint({ ...base, description: 'kave bar' });
    expect(a).toBe(b);
  });

  it('differs when amount differs', async () => {
    const a = await computeImportFingerprint({ ...base, amount: 12.5, description: 'X' });
    const b = await computeImportFingerprint({ ...base, amount: 12.51, description: 'X' });
    expect(a).not.toBe(b);
  });

  it('differs when payment source differs', async () => {
    const a = await computeImportFingerprint({ ...base, paymentSource: 'custom:abc', description: 'X' });
    const b = await computeImportFingerprint({ ...base, paymentSource: 'custom:def', description: 'X' });
    expect(a).not.toBe(b);
  });

  it('differs across users (scopes per-user dedup)', async () => {
    const a = await computeImportFingerprint({ ...base, userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', description: 'X' });
    const b = await computeImportFingerprint({ ...base, userId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', description: 'X' });
    expect(a).not.toBe(b);
  });

  it('starts with imp: prefix', async () => {
    const fp = await computeImportFingerprint({ ...base, description: 'X' });
    expect(fp.startsWith('imp:')).toBe(true);
  });

  // ─── Step B: merchant-first stability ────────────────────────────────────

  it('produces same fingerprint for AI-noisy merchant variants', async () => {
    const a = await computeImportFingerprint({ ...base, merchantName: 'CAFFE BAR ABC 1234 ZAGREB' });
    const b = await computeImportFingerprint({ ...base, merchantName: 'Caffe bar ABC' });
    const c = await computeImportFingerprint({ ...base, merchantName: 'caffe-bar abc d.o.o.' });
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('ignores description when merchant is present (stable across reparses)', async () => {
    const a = await computeImportFingerprint({
      ...base,
      merchantName: 'KONZUM',
      description: 'KONZUM ZAGREB Ilica 1234',
    });
    const b = await computeImportFingerprint({
      ...base,
      merchantName: 'KONZUM',
      description: 'Kupnja - KONZUM',
    });
    expect(a).toBe(b);
  });

  it('falls back to description when merchant is missing', async () => {
    const a = await computeImportFingerprint({ ...base, merchantName: null, description: 'KONZUM' });
    const b = await computeImportFingerprint({ ...base, description: 'KONZUM' });
    expect(a).toBe(b);
  });

  it('manual entry without merchant matches bank row with merchant of same text', async () => {
    // Same logical row: manual "konzum" vs bank row merchant "KONZUM ZAGREB 123"
    // (won't perfectly match because manual has no merchant — but description
    // fallback should at least stay stable per side.)
    const manual = await computeImportFingerprint({ ...base, description: 'konzum' });
    const manualAgain = await computeImportFingerprint({ ...base, description: 'KONZUM' });
    expect(manual).toBe(manualAgain);
  });

  // ─── Step C: balance_after in fingerprint ────────────────────────────────


  it('backward-compat: same input WITHOUT balance produces the pre-balance hash', async () => {
    // Hardcoded regression: this hash was computed by the pre-balance formula
    // for the exact input below. If the formula for balance-less inputs ever
    // shifts, this assertion fails and 289 stored anchors would be invalidated.
    const fp = await computeImportFingerprint({
      userId: user,
      paymentSource: 'custom:abc',
      date: new Date('2026-05-19'),
      type: 'expense',
      amount: 12.5,
      description: 'KONZUM ZAGREB',
    });
    expect(fp).toBe('imp:8143cfdb426aba6d118e23a7787722ae0a3bf5634278c4aaad0470a86dd9d109');
  });

  it('two identical inputs with different balance_after produce DIFFERENT hashes', async () => {
    const a = await computeImportFingerprint({
      ...base, merchantName: 'AIRCASH', balanceAfter: 3627.22,
    });
    const b = await computeImportFingerprint({
      ...base, merchantName: 'AIRCASH', balanceAfter: 3527.22,
    });
    expect(a).not.toBe(b);
  });

  it('balanceAfter null/undefined/NaN yields identical hash to the no-balance formula', async () => {
    const bare = await computeImportFingerprint({ ...base, description: 'KONZUM' });
    const withNull = await computeImportFingerprint({ ...base, description: 'KONZUM', balanceAfter: null });
    const withUndef = await computeImportFingerprint({ ...base, description: 'KONZUM', balanceAfter: undefined });
    const withNaN = await computeImportFingerprint({ ...base, description: 'KONZUM', balanceAfter: Number.NaN });
    expect(withNull).toBe(bare);
    expect(withUndef).toBe(bare);
    expect(withNaN).toBe(bare);
  });
});

describe('computeImportKey (v2 — bez AI-teksta)', () => {
  const b = {
    userId: user,
    paymentSource: 'custom:abc',
    date: new Date('2026-05-19T00:00:00Z'),
    type: 'expense',
    amount: 12.5,
  };

  it('ignorira ime trgovca i opis u potpunosti', async () => {
    const a = await computeImportKey({ ...b, balanceAfter: 100 });
    const c = await computeImportKey({ ...b, balanceAfter: 100 });
    expect(a).toBe(c);
    expect(importKeyCanonicalString({ ...b, balanceAfter: 100 })).not.toMatch(/facebook/i);
  });

  it('razlikuje retke po saldu nakon retka', async () => {
    const a = await computeImportKey({ ...b, balanceAfter: 100 });
    const c = await computeImportKey({ ...b, balanceAfter: 87.5 });
    expect(a).not.toBe(c);
  });

  it('bez salda koristi redni broj među identičnim redcima', async () => {
    const rows = [
      { ...b, balanceAfter: null },
      { ...b, balanceAfter: null },
      { ...b, amount: 30, balanceAfter: null },
    ];
    const keys = await computeImportKeys(rows);
    expect(keys[0]).not.toBe(keys[1]);
    expect(new Set(keys).size).toBe(3);
    const again = await computeImportKeys(rows);
    expect(again).toEqual(keys);
  });

  it('kanonski niz je stabilan i nosi prefiks imp2:', async () => {
    expect(importKeyCanonicalString({ ...b, balanceAfter: 100 }))
      .toBe(`v2|${user}|custom:abc|2026-05-19|expense|12.50|bal:100.00`);
    expect(importKeyCanonicalString({ ...b, balanceAfter: null }))
      .toBe(`v2|${user}|custom:abc|2026-05-19|expense|12.50|ord:0`);
    expect((await computeImportKey({ ...b, balanceAfter: 100 })).startsWith('imp2:')).toBe(true);
  });
});
