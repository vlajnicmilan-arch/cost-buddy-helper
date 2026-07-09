/**
 * PIN hashing (PBKDF2-SHA256, versioned format).
 * Storage format:  v2:<iterations>:<saltB64>:<hashB64>
 *
 * Legacy 32-bit hash (see AppLockContext hashPin) is only used for
 * one-shot migration on unlock and is marked @deprecated.
 */

export const PIN_KDF_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32; // 256 bits

const getCrypto = (): Crypto => {
  const c = (globalThis as any).crypto as Crypto | undefined;
  if (!c || !c.subtle || !c.getRandomValues) {
    throw new Error('WebCrypto not available');
  }
  return c;
};

const toB64 = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const fromB64 = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};

async function pbkdf2(
  pin: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const crypto = getCrypto();
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPinV2(
  pin: string,
  iterations: number = PIN_KDF_ITERATIONS,
): Promise<string> {
  const crypto = getCrypto();
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(pin, salt, iterations);
  return `v2:${iterations}:${toB64(salt)}:${toB64(hash)}`;
}

export function isV2Hash(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith('v2:');
}

export async function verifyPinV2(pin: string, stored: string): Promise<boolean> {
  if (!isV2Hash(stored)) return false;
  const parts = stored.split(':');
  if (parts.length !== 4) return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromB64(parts[2]);
    expected = fromB64(parts[3]);
  } catch {
    return false;
  }
  const actual = await pbkdf2(pin, salt, iterations);
  return constantTimeEqual(actual, expected);
}

/**
 * @deprecated Legacy 32-bit hash — kept ONLY for one-time migration to v2
 * on successful unlock. Do not use for new writes.
 */
export function legacyHashPin(pin: string): string {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    const char = pin.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'pin_' + Math.abs(hash).toString(36);
}
