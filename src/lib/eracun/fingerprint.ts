/**
 * eRačun — otisak protiv duplikata.
 *
 * sha256(normalizirani OIB dobavljača + '|' + normalizirani broj računa).
 * Čist modul: koristi WebCrypto (`crypto.subtle`), bez ovisnosti o UI-u ili bazi.
 */

/** Uklanja razmake i pretvara u velika slova; prazna vrijednost → ''. */
const normalize = (value: string | null | undefined): string =>
  (value ?? '').replace(/\s+/g, '').toUpperCase();

/** OIB bez `HR` prefiksa i bez razmaka. */
export const normalizeOib = (value: string | null | undefined): string =>
  normalize(value).replace(/^HR/, '');

export const fingerprintInput = (
  supplierOib: string | null | undefined,
  invoiceNumber: string | null | undefined,
): string => `${normalizeOib(supplierOib)}|${normalize(invoiceNumber)}`;

/** sha256 heksadecimalno (64 znaka). */
export const invoiceFingerprint = async (
  supplierOib: string | null | undefined,
  invoiceNumber: string | null | undefined,
): Promise<string> => {
  const data = new TextEncoder().encode(fingerprintInput(supplierOib, invoiceNumber));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};
