/**
 * Hrvatski format datuma — JEDINI izvor istine za prikaz i tolerantan unos.
 *
 * Pravilo: u stanju, payloadu i bazi datum je UVIJEK ISO (`yyyy-mm-dd`).
 * Hrvatski oblik (`dd.mm.gggg.`) je isključivo prikaz i korisnički unos.
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HR_RE = /^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})\s*\.?$/;

const isRealDate = (y: number, m: number, d: number): boolean => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const iso = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** ISO (ili Date) → `dd.mm.gggg.`; nevaljan ulaz vraća prazan string. */
export const formatDateHr = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return `${String(value.getDate()).padStart(2, '0')}.${String(value.getMonth() + 1).padStart(2, '0')}.${value.getFullYear()}.`;
  }
  const raw = String(value).trim();
  const isoPart = raw.slice(0, 10);
  const m = isoPart.match(ISO_RE);
  if (m) {
    const [, y, mo, d] = m;
    if (!isRealDate(Number(y), Number(mo), Number(d))) return '';
    return `${d}.${mo}.${y}.`;
  }
  // Već je hrvatski oblik — normaliziraj kroz parser.
  const parsed = parseHrDate(raw);
  return parsed ? formatDateHr(parsed) : '';
};

/**
 * Tolerantan unos: `8.8.2026`, `08.08.2026.`, `8/8/2026`, `2026-08-08`.
 * Vraća ISO string ili `null` (nikad tihi pad na današnji datum).
 */
export const parseHrDate = (text: string | null | undefined): string | null => {
  const raw = (text ?? '').trim();
  if (raw === '') return null;

  const isoMatch = raw.match(ISO_RE) ?? raw.replace(/\.$/, '').match(ISO_RE);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const mo = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    return isRealDate(y, mo, d) ? iso(y, mo, d) : null;
  }

  const hr = raw.match(HR_RE);
  if (hr) {
    const d = Number(hr[1]);
    const mo = Number(hr[2]);
    const y = Number(hr[3]);
    return isRealDate(y, mo, d) ? iso(y, mo, d) : null;
  }

  return null;
};

/** ISO → `Date` u lokalnoj zoni (za shadcn Calendar `selected`). */
export const isoToDate = (value: string | null | undefined): Date | undefined => {
  const parsed = parseHrDate(value ?? '');
  if (!parsed) return undefined;
  const [y, m, d] = parsed.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** `Date` → ISO (`yyyy-mm-dd`), lokalna zona (bez UTC pomaka). */
export const dateToIso = (date: Date): string =>
  iso(date.getFullYear(), date.getMonth() + 1, date.getDate());

/**
 * UI prikaz datuma prema aktivnom jeziku, s vidljivom godinom.
 * Koristi postojeći hrvatski pomoćnik za HR; za EN/DE koristi Intl.
 */
export const formatDateUi = (iso: string, language?: string | null): string => {
  const lang = (language ?? 'hr').toLowerCase();
  if (lang === 'hr' || lang.startsWith('hr')) {
    return formatDateHr(iso);
  }
  const locale = lang === 'en' ? 'en-GB' : lang === 'de' ? 'de-DE' : 'en-GB';
  const date = isoToDate(iso);
  if (!date) return formatDateHr(iso);
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return formatDateHr(iso);
  }
};
