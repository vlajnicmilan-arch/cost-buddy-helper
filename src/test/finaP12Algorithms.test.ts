/**
 * Brana: odabir puta za otključavanje p12 ide po identifikatoru algoritma,
 * ne po nagađanju. PBES2 -> WebCrypto, stari pbeWithSHAAnd* -> forge.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyEncryptionAlgorithm,
  prfToHash,
  aesKeyBytes,
  OID,
} from '../../supabase/functions/_shared/fina/p12Algorithms.ts';

describe('p12 algorithm selection', () => {
  it('PBES2 goes to the WebCrypto path', () => {
    expect(classifyEncryptionAlgorithm(OID.pbes2)).toBe('pbes2');
  });

  it('pbeWithSHAAnd3-KeyTripleDES-CBC stays on forge', () => {
    expect(classifyEncryptionAlgorithm('1.2.840.113549.1.12.1.3')).toBe('legacy');
    expect(classifyEncryptionAlgorithm('1.2.840.113549.1.12.1.6')).toBe('legacy'); // 40bit RC2
  });

  it('unknown identifiers are not silently treated as PBES2', () => {
    expect(classifyEncryptionAlgorithm('1.3.6.1.4.1.99999.1')).toBe('unknown');
  });

  it('maps PBKDF2 pseudo-random functions to WebCrypto hashes', () => {
    expect(prfToHash('1.2.840.113549.2.9')).toBe('SHA-256');
    expect(prfToHash('1.2.840.113549.2.7')).toBe('SHA-1');
    expect(prfToHash(null)).toBe('SHA-1'); // default when absent
    expect(prfToHash('1.2.3.4')).toBeNull();
  });

  it('maps AES-CBC schemes to key lengths', () => {
    expect(aesKeyBytes('2.16.840.1.101.3.4.1.42')).toBe(32);
    expect(aesKeyBytes('2.16.840.1.101.3.4.1.2')).toBe(16);
    expect(aesKeyBytes('2.16.840.1.101.3.4.1.22')).toBe(24);
    expect(aesKeyBytes('1.2.3.4')).toBeNull();
  });
});
