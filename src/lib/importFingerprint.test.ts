import { describe, it, expect } from 'vitest';
import { computeImportFingerprint } from '@/lib/importFingerprint';

const user = '11111111-1111-1111-1111-111111111111';

describe('computeImportFingerprint', () => {
  it('returns identical hash for identical input', async () => {
    const a = await computeImportFingerprint({
      userId: user, paymentSource: 'custom:abc', date: new Date('2026-05-19'),
      type: 'expense', amount: 12.5, description: 'KONZUM ZAGREB',
    });
    const b = await computeImportFingerprint({
      userId: user, paymentSource: 'custom:abc', date: new Date('2026-05-19'),
      type: 'expense', amount: 12.5, description: 'KONZUM ZAGREB',
    });
    expect(a).toBe(b);
  });

  it('is whitespace/case/diacritic insensitive in description', async () => {
    const a = await computeImportFingerprint({
      userId: user, paymentSource: 'custom:abc', date: new Date('2026-05-19'),
      type: 'expense', amount: 12.5, description: 'Kávé  bár',
    });
    const b = await computeImportFingerprint({
      userId: user, paymentSource: 'custom:abc', date: new Date('2026-05-19'),
      type: 'expense', amount: 12.5, description: 'kave bar',
    });
    expect(a).toBe(b);
  });

  it('differs when amount differs', async () => {
    const a = await computeImportFingerprint({
      userId: user, paymentSource: 'custom:abc', date: new Date('2026-05-19'),
      type: 'expense', amount: 12.5, description: 'X',
    });
    const b = await computeImportFingerprint({
      userId: user, paymentSource: 'custom:abc', date: new Date('2026-05-19'),
      type: 'expense', amount: 12.51, description: 'X',
    });
    expect(a).not.toBe(b);
  });

  it('differs when payment source differs', async () => {
    const a = await computeImportFingerprint({
      userId: user, paymentSource: 'custom:abc', date: new Date('2026-05-19'),
      type: 'expense', amount: 1, description: 'X',
    });
    const b = await computeImportFingerprint({
      userId: user, paymentSource: 'custom:def', date: new Date('2026-05-19'),
      type: 'expense', amount: 1, description: 'X',
    });
    expect(a).not.toBe(b);
  });

  it('differs across users (scopes per-user dedup)', async () => {
    const a = await computeImportFingerprint({
      userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', paymentSource: 'custom:abc',
      date: new Date('2026-05-19'), type: 'expense', amount: 1, description: 'X',
    });
    const b = await computeImportFingerprint({
      userId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', paymentSource: 'custom:abc',
      date: new Date('2026-05-19'), type: 'expense', amount: 1, description: 'X',
    });
    expect(a).not.toBe(b);
  });

  it('starts with imp: prefix', async () => {
    const fp = await computeImportFingerprint({
      userId: user, paymentSource: 'custom:abc', date: new Date('2026-05-19'),
      type: 'expense', amount: 1, description: 'X',
    });
    expect(fp.startsWith('imp:')).toBe(true);
  });
});
