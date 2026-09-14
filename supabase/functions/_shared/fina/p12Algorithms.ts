// Algorithm identifiers used inside a PKCS#12 file.
// Pure lookups, no dependencies — so the selection rule can be unit tested.

export const OID = {
  data: "1.2.840.113549.1.7.1",
  encryptedData: "1.2.840.113549.1.7.6",
  certBag: "1.2.840.113549.1.12.10.1.3",
  keyBag: "1.2.840.113549.1.12.10.1.1",
  pkcs8ShroudedKeyBag: "1.2.840.113549.1.12.10.1.2",
  x509Certificate: "1.2.840.113549.1.9.22.1",
  pbes2: "1.2.840.113549.1.5.13",
  pbkdf2: "1.2.840.113549.1.5.12",
} as const;

/** PBKDF2 pseudo-random functions we can run on WebCrypto. */
const PRF_HASH: Record<string, string> = {
  "1.2.840.113549.2.7": "SHA-1",
  "1.2.840.113549.2.9": "SHA-256",
  "1.2.840.113549.2.10": "SHA-384",
  "1.2.840.113549.2.11": "SHA-512",
};

/** AES-CBC content encryption schemes, mapped to their key length in bytes. */
const AES_CBC_KEY_BYTES: Record<string, number> = {
  "2.16.840.1.101.3.4.1.2": 16, // aes128-CBC
  "2.16.840.1.101.3.4.1.22": 24, // aes192-CBC
  "2.16.840.1.101.3.4.1.42": 32, // aes256-CBC
};

export type AlgorithmKind = "pbes2" | "legacy" | "unknown";

/**
 * PBES2 (PBKDF2 + AES-CBC) runs on WebCrypto.
 * The old pbeWithSHAAnd* family (3DES / RC2) has no WebCrypto equivalent
 * and must stay on the node-forge path.
 */
export function classifyEncryptionAlgorithm(oid: string): AlgorithmKind {
  if (oid === OID.pbes2) return "pbes2";
  if (oid.startsWith("1.2.840.113549.1.12.1.")) return "legacy"; // pbeWithSHAAnd*
  if (oid.startsWith("1.2.840.113549.1.5.")) return "legacy"; // pbeWithMD5AndDES etc.
  return "unknown";
}

export function prfToHash(oid: string | null | undefined): string | null {
  if (!oid) return "SHA-1"; // PBKDF2 default prf
  return PRF_HASH[oid] ?? null;
}

export function aesKeyBytes(oid: string): number | null {
  return AES_CBC_KEY_BYTES[oid] ?? null;
}

/** Thrown when a bag uses an algorithm WebCrypto cannot handle. */
export class LegacyAlgorithmError extends Error {
  constructor(public readonly oid: string) {
    super(`p12 uses legacy algorithm ${oid}`);
    this.name = "LegacyAlgorithmError";
  }
}
