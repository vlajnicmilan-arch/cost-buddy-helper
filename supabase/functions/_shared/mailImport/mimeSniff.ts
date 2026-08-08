/**
 * MAIL UVOZ — njuškanje MIME tipa po magičnim bajtovima.
 *
 * NAČELO: deklarirani `Content-Type` iz e-maila NIJE mjerodavan. Odlučuju
 * bajtovi. Nesklad deklariranog i stvarnog tipa nije automatski odbijanje,
 * ali JEST signal koji se bilježi i prikazuje korisniku.
 *
 * ZIP nije na allowlisti svjesno — arhiva znači rekurzivno raspakiravanje i
 * cijelu klasu napada (zip bomb, path traversal). Ne otvaramo ta vrata.
 */

export type SniffedType = 'pdf' | 'xml' | 'jpg' | 'png' | 'heic' | 'zip' | 'unknown';

/** Tipovi koje cjevovod smije obrađivati. Sve ostalo ide u karantenu. */
export const ALLOWED_TYPES: readonly SniffedType[] = ['pdf', 'xml', 'jpg', 'png', 'heic'];

const startsWith = (bytes: Uint8Array, sig: readonly number[], offset = 0): boolean => {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i += 1) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
};

const asciiAt = (bytes: Uint8Array, offset: number, length: number): string => {
  let out = '';
  const end = Math.min(bytes.length, offset + length);
  for (let i = offset; i < end; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
};

/** Prvi ne-prazni znakovi (preskače BOM i bjeline) — za prepoznavanje XML-a. */
const leadingText = (bytes: Uint8Array): string => {
  let start = 0;
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) start = 3;
  while (start < bytes.length && [0x20, 0x09, 0x0a, 0x0d].includes(bytes[start])) start += 1;
  return asciiAt(bytes, start, 64);
};

export function sniffMime(bytes: Uint8Array): SniffedType {
  if (bytes.length === 0) return 'unknown';

  // %PDF
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf';
  // JPEG: FF D8 FF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  // HEIC/HEIF: ....ftypheic | heix | mif1 | msf1 | hevc
  if (asciiAt(bytes, 4, 4) === 'ftyp') {
    const brand = asciiAt(bytes, 8, 4).toLowerCase();
    if (['heic', 'heix', 'heif', 'mif1', 'msf1', 'hevc'].includes(brand)) return 'heic';
  }
  // ZIP (uključuje docx/xlsx) — svjesno NIJE dopušten
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) {
    return 'zip';
  }

  const head = leadingText(bytes);
  if (head.startsWith('<?xml')) return 'xml';
  // UBL bez XML deklaracije
  if (/^<[A-Za-z_][\w.-]*(:[A-Za-z_][\w.-]*)?[\s>]/.test(head)) return 'xml';

  return 'unknown';
}

/** Grubo mapiranje deklariranog MIME-a u našu obitelj tipova. */
export function declaredFamily(mimeDeclared: string | null | undefined): SniffedType {
  const m = (mimeDeclared ?? '').toLowerCase();
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('xml')) return 'xml';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('heic') || m.includes('heif')) return 'heic';
  if (m.includes('zip')) return 'zip';
  return 'unknown';
}

export interface MimeVerdict {
  sniffed: SniffedType;
  declared: SniffedType;
  /** Deklaracija i bajtovi se ne slažu — signal, ne presuda. */
  mismatch: boolean;
  allowed: boolean;
  /** Popunjen samo kad `allowed === false`. */
  quarantineReason: string | null;
}

export function evaluateMime(
  bytes: Uint8Array,
  mimeDeclared: string | null | undefined,
): MimeVerdict {
  const sniffed = sniffMime(bytes);
  const declared = declaredFamily(mimeDeclared);
  const allowed = ALLOWED_TYPES.includes(sniffed);
  return {
    sniffed,
    declared,
    mismatch: declared !== 'unknown' && declared !== sniffed,
    allowed,
    quarantineReason: allowed
      ? null
      : sniffed === 'zip'
        ? 'arhiva_nije_podrzana'
        : 'nepodrzan_tip',
  };
}
