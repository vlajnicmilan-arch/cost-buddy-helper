/**
 * Payment Source — read-side resolver (Foundation Plan, Val 1).
 *
 * Tolerantni reader: za bilo koji input (built-in slug, `custom:UUID`,
 * raw UUID, NULL, prazno) vrati ISTI ključ za semantički isti izvor.
 *
 * Koristiti u:
 *   - reports bucketiranju
 *   - duplicate detection
 *   - manual ↔ bank merge match
 *   - hidden sources filter
 *   - import fingerprint
 *
 * NE koristi se u write pathu — tamo ide `normalizePaymentSource`.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOM_RE = /^custom:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Vraća kanonski ključ za usporedbu/bucketiranje.
 * - raw UUID i `custom:UUID` istog izvora → isti `custom:UUID` (lowercase)
 * - built-in slug → vraća se kakav jest (trimmed)
 * - NULL / prazno → `__unknown__`
 * - bilo što drugo → vraća se trimmed (legacy passthrough — danas ne postoji u bazi)
 */
export function resolvePaymentSourceKey(value: string | null | undefined): string {
  if (value == null) return '__unknown__';
  const trimmed = String(value).trim();
  if (trimmed === '') return '__unknown__';

  const customMatch = CUSTOM_RE.exec(trimmed);
  if (customMatch) return `custom:${customMatch[1].toLowerCase()}`;

  if (UUID_RE.test(trimmed)) return `custom:${trimmed.toLowerCase()}`;

  return trimmed;
}

/**
 * Vraća true ako dva inputa referenciraju isti payment source nakon normalizacije.
 */
export function isSamePaymentSource(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return resolvePaymentSourceKey(a) === resolvePaymentSourceKey(b);
}
