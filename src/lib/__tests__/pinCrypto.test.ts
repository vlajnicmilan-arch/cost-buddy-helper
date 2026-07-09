import { describe, it, expect } from 'vitest';
import {
  hashPinV2,
  verifyPinV2,
  isV2Hash,
  legacyHashPin,
  PIN_KDF_ITERATIONS,
} from '@/lib/pinCrypto';

describe('pinCrypto v2', () => {
  it('roundtrips a correct PIN', async () => {
    const stored = await hashPinV2('1234');
    expect(isV2Hash(stored)).toBe(true);
    expect(await verifyPinV2('1234', stored)).toBe(true);
  });

  it('rejects a wrong PIN', async () => {
    const stored = await hashPinV2('1234');
    expect(await verifyPinV2('4321', stored)).toBe(false);
    expect(await verifyPinV2('', stored)).toBe(false);
  });

  it('produces different hashes for the same PIN (random salt)', async () => {
    const a = await hashPinV2('1234');
    const b = await hashPinV2('1234');
    expect(a).not.toEqual(b);
    // both still verify
    expect(await verifyPinV2('1234', a)).toBe(true);
    expect(await verifyPinV2('1234', b)).toBe(true);
  });

  it('uses the configured iteration count in the stored format', async () => {
    const stored = await hashPinV2('1234');
    const parts = stored.split(':');
    expect(parts[0]).toBe('v2');
    expect(Number(parts[1])).toBe(PIN_KDF_ITERATIONS);
    expect(Number(parts[1])).toBeGreaterThanOrEqual(210_000);
  });

  it('rejects malformed stored values', async () => {
    expect(await verifyPinV2('1234', 'not-v2')).toBe(false);
    expect(await verifyPinV2('1234', 'v2:only')).toBe(false);
    expect(await verifyPinV2('1234', 'v2:0:aa:bb')).toBe(false);
  });

  it('isV2Hash detects legacy vs v2', () => {
    expect(isV2Hash(legacyHashPin('1234'))).toBe(false);
    expect(isV2Hash('v2:210000:xx:yy')).toBe(true);
    expect(isV2Hash(null)).toBe(false);
  });

  it('legacy hash still deterministic (for migration path)', () => {
    expect(legacyHashPin('1234')).toBe(legacyHashPin('1234'));
    expect(legacyHashPin('1234')).not.toBe(legacyHashPin('4321'));
  });
});
