/**
 * MAIL UVOZ — JEDINI prevoditelj datuma (obrazac kao `docType.ts`).
 *
 * ZAŠTO: AI dopuna zna vratiti hrvatski oblik ("28.02.2026."), a deterministički
 * čitač ISO. Sirov hrvatski oblik u INSERT-u puca na bazi
 * (`22008 date/time field value out of range`) i blokira korisnika.
 *
 * Pravilo: u payloadu i bazi datum je UVIJEK `YYYY-MM-DD`. Nevaljan ili
 * dvosmislen ulaz vraća `null` — nikad se ne izmišlja datum.
 */

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const HR_RE = /^(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{4})\s*\.?$/;

const isRealDate = (y: number, m: number, d: number): boolean => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const iso = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Datumska polja koja putuju kroz `extraction` i payload potvrde. */
export const DATE_FIELD_KEYS = ['issue_date', 'due_date', 'delivery_date', 'payment_date'] as const;

/**
 * "28.02.2026." | "28.2.2026" | "28. 02. 2026." | "2026-02-28" | Date → ISO.
 * Sve ostalo (prazno, smeće, nepostojeći dan) → `null`.
 */
export function normalizeDateToIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return iso(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }

  if (typeof value !== 'string' && typeof value !== 'number') return null;

  const raw = String(value).trim();
  if (raw === '') return null;

  // ISO s vremenskim dijelom ("2026-02-28T10:00:00Z") — uzmi datumski dio.
  const isoCandidate = raw.length > 10 && /^\d{4}-\d{2}-\d{2}[T\s]/.test(raw) ? raw.slice(0, 10) : raw;

  const isoMatch = isoCandidate.match(ISO_RE);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    return isRealDate(y, m, d) ? iso(y, m, d) : null;
  }

  const hr = raw.match(HR_RE);
  if (hr) {
    const d = Number(hr[1]);
    const m = Number(hr[2]);
    const y = Number(hr[3]);
    return isRealDate(y, m, d) ? iso(y, m, d) : null;
  }

  return null;
}

/**
 * Normalizira SVA datumska polja objekta na ISO. Nevaljan ulaz postaje `null`
 * (poštena greška „nedostaju polja" umjesto pucanja baze).
 */
export function normalizeExtractionDates<T extends Record<string, unknown>>(
  source: T | null | undefined,
): Record<string, unknown> {
  if (!source) return {};
  const out: Record<string, unknown> = { ...source };
  for (const key of DATE_FIELD_KEYS) {
    if (!(key in out)) continue;
    out[key] = normalizeDateToIso(out[key]);
  }
  return out;
}
