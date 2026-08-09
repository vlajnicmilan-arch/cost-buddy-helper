/**
 * MAIL UVOZ — sigurni ključ za Supabase Storage.
 *
 * ZAŠTO: Storage odbija ključeve s ne-ASCII znakovima (`InvalidKey`). Privitak
 * "Račun.pdf" je rušio cijeli prijem (500 → Mailgun ponavlja → poruka nikad
 * ne nastane). Ime datoteke NIKAD ne ide sirovo u ključ.
 */

/** Razlog karantene kad privitak prelazi dopuštenu veličinu. */
export const ATTACHMENT_TOO_LARGE = 'privitak_prevelik';

/** Pretvara ime datoteke u ASCII-siguran segment ključa. */
export function sanitizeStorageSegment(name: string, fallback = 'privitak'): string {
  const normalized = (name ?? '')
    .normalize('NFD')
    // dijakritika van (č → c, š → s, ž → z, ć → c, đ → d)
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

  const cleaned = normalized
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '');

  const trimmed = cleaned.slice(0, 120);
  return trimmed.length > 0 ? trimmed : fallback;
}
