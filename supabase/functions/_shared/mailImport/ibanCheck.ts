/**
 * MAIL UVOZ — provjera IBAN-a protiv zapamćene povijesti za isti OIB.
 *
 * TVRDO UPOZORENJE, NEOVISNO O RAZINI POVJERENJA: ako dokument nosi IBAN koji
 * se ne poklapa ni s jednim dosad potvrđenim IBAN-om tog OIB-a, stavka dobiva
 * upozorenje. Ovo je najčešći oblik prijevare (podmetnut broj računa) i mora
 * biti vidljiv i kod T1 poruka.
 */

export const IBAN_MISMATCH_WARNING = 'iban_ne_odgovara_povijesti';
export const IBAN_FIRST_SEEN_NOTICE = 'iban_prvi_put_vidjen';

export const normalizeIban = (value: string | null | undefined): string =>
  (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export interface IbanCheckResult {
  /** Novi IBAN uz postojeću povijest za taj OIB. */
  mismatch: boolean;
  /** Za taj OIB nemamo nijedan zapamćen IBAN. */
  firstSeen: boolean;
  warnings: string[];
  normalized: string;
}

export function checkIbanAgainstHistory(
  iban: string | null | undefined,
  knownIbans: readonly (string | null | undefined)[],
): IbanCheckResult {
  const normalized = normalizeIban(iban);
  const known = new Set(
    knownIbans.map(normalizeIban).filter((v) => v.length > 0),
  );

  if (normalized.length === 0) {
    return { mismatch: false, firstSeen: false, warnings: [], normalized: '' };
  }
  if (known.size === 0) {
    return {
      mismatch: false,
      firstSeen: true,
      warnings: [IBAN_FIRST_SEEN_NOTICE],
      normalized,
    };
  }
  if (known.has(normalized)) {
    return { mismatch: false, firstSeen: false, warnings: [], normalized };
  }
  return {
    mismatch: true,
    firstSeen: false,
    warnings: [IBAN_MISMATCH_WARNING],
    normalized,
  };
}
