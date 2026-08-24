/**
 * Deterministic import fingerprint for bulk-imported transactions (PDF/HTML/CSV).
 *
 * Stored in `expenses.bank_transaction_id`. Backed by the DB unique index
 * `uniq_expenses_user_bank_tx (user_id, bank_transaction_id)` — re-importing
 * the same statement therefore cannot create duplicates even if the AI parser
 * returns a slightly different set of rows on a retry.
 *
 * Pure module — no React, no Supabase. Browser-only (uses Web Crypto).
 *
 * Stability note (step B):
 * The AI parser is non-deterministic on free-text description ("CAFFE BAR ABC"
 * vs "Caffe bar ABC 1234 Zagreb"), so we hash the *normalized merchant name*
 * first. Description is only used as a fallback when merchant is missing.
 * Normalization mirrors `normalizeMerchant` in `duplicateDetection.ts` so the
 * row-level and statement-level layers agree on identity.
 */

const PREFIX = 'imp';

/**
 * Mirror of duplicateDetection.normalizeMerchant — strips diacritics, common
 * legal suffixes, store numbers, punctuation, geo/country stop-words, and
 * collapses whitespace. Keep in sync with duplicateDetection.GEO_STOPWORDS.
 */
const GEO_STOPWORDS = new Set([
  'split','zagreb','rijeka','osijek','zadar','pula','sibenik','dubrovnik',
  'varazdin','karlovac','vinkovci','sisak','slavonski','brod','bjelovar',
  'kastel','supetar','trogir','makarska','samobor','koprivnica','krapina',
  'cakovec','gospic','velika','gorica','hrv','hrvatska','hr','eur','eu',
]);

function normalizeMerchant(name: string | null | undefined): string {
  if (!name) return '';
  const cleaned = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(d\.?o\.?o\.?|d\.?d\.?|j\.?d\.?o\.?o\.?|obrt|trgovina|trgovacki|trgovački|poslovanje|hotel)\b/gi, '')
    .replace(/\b\d{2,}\b/g, ' ')
    .replace(/[.,&\-_'"()/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.split(/\s+/).filter(w => !GEO_STOPWORDS.has(w)).join(' ').trim();
}

/**
 * Looser fallback for plain descriptions (no legal-suffix stripping).
 */
function normalizeDescription(desc: string | null | undefined): string {
  if (!desc) return '';
  return desc
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toDateKey(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return 'invalid';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toAmountKey(amount: number): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtle: SubtleCrypto | undefined = (globalThis as any).crypto?.subtle;
  if (subtle) {
    const hash = await subtle.digest('SHA-256', buf);
    const bytes = new Uint8Array(hash);
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, '0');
    return out;
  }
  // Fallback: FNV-1a 32-bit (good enough scoped to a single user)
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.length; i += 1) {
    h ^= buf[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export interface FingerprintInput {
  userId: string;
  paymentSource?: string | null;
  date: Date | string;
  type: string;
  amount: number;
  description?: string | null;
  merchantName?: string | null;
  /**
   * Optional running-balance ("saldo nakon") captured by the PDF parser.
   * When present as a finite number, it disambiguates otherwise-identical
   * rows on the same day (2× 100€ Aircash → different balance_after).
   * When null/undefined (pending rows, older imports, banks without a
   * running balance), the fingerprint is computed WITHOUT this segment —
   * this preserves backward compatibility with the 289 existing anchors.
   */
  balanceAfter?: number | null;
}

/**
 * Returns a stable string suitable for `expenses.bank_transaction_id`.
 * Identity key = normalized merchant first, normalized description as fallback.
 */
export async function computeImportFingerprint(input: FingerprintInput): Promise<string> {
  const merchant = normalizeMerchant(input.merchantName);
  const text = merchant || normalizeDescription(input.description);
  const parts = [
    input.userId,
    String(input.paymentSource ?? ''),
    toDateKey(input.date),
    String(input.type ?? ''),
    toAmountKey(input.amount),
    text,
  ];
  // Append balance segment ONLY when a finite number is provided. Absence
  // (null/undefined/NaN) MUST produce a hash identical to the pre-balance
  // formula so existing 289 anchors remain valid.
  if (typeof input.balanceAfter === 'number' && Number.isFinite(input.balanceAfter)) {
    parts.push(`bal:${input.balanceAfter.toFixed(2)}`);
  }
  const hash = await sha256Hex(parts.join('|'));
  return `${PREFIX}:${hash}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// V2 KLJUČ UVOZA — bez AI-teksta
// ─────────────────────────────────────────────────────────────────────────────
/**
 * AI čitač svaki put drukčije napiše ime trgovca ("Facebook" / "Paypal
 * *facebook" / "Facebook (Paypal)"), pa je otisak koji hashira taj tekst
 * nestabilan i isti redak ulazi više puta. V2 ključ gradi identitet ISKLJUČIVO
 * od onoga što banka daje stabilno:
 *
 *   user_id | payment_source | datum (UTC) | tip | iznos | saldo nakon retka
 *
 * Kad izvod nema stupac salda (npr. KEKS), umjesto salda ide redni broj među
 * IDENTIČNIM redcima istog dana (`ord:N`) — nikad ime trgovca ni opis.
 *
 * Datum je UTC dan (`toISOString().slice(0,10)`), isti dan koji završi u
 * `expenses.date`, pa ga SQL prijelaz može doslovno reproducirati.
 */
const PREFIX_V2 = 'imp2';

export interface ImportKeyInput {
  userId: string;
  paymentSource?: string | null;
  date: Date | string;
  type: string;
  amount: number;
  balanceAfter?: number | null;
  /** Redni broj među identičnim redcima (koristi se samo bez salda). */
  ordinal?: number;
}

function toUtcDateKey(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return 'invalid';
  return date.toISOString().slice(0, 10);
}

/** Kanonski niz koji SQL prijelaz mora reproducirati znak po znak. */
export function importKeyCanonicalString(input: ImportKeyInput): string {
  const hasBalance = typeof input.balanceAfter === 'number' && Number.isFinite(input.balanceAfter);
  const tail = hasBalance
    ? `bal:${(input.balanceAfter as number).toFixed(2)}`
    : `ord:${Number.isFinite(input.ordinal) ? Number(input.ordinal) : 0}`;
  return [
    'v2',
    input.userId,
    String(input.paymentSource ?? ''),
    toUtcDateKey(input.date),
    String(input.type ?? ''),
    toAmountKey(input.amount),
    tail,
  ].join('|');
}

export async function computeImportKey(input: ImportKeyInput): Promise<string> {
  const hash = await sha256Hex(importKeyCanonicalString(input));
  return `${PREFIX_V2}:${hash}`;
}

/**
 * Ključevi za cijeli izvod odjednom — jedino mjesto koje dodjeljuje `ord:N`
 * redcima bez salda (redoslijed = redoslijed na izvodu).
 */
export async function computeImportKeys(
  rows: readonly Omit<ImportKeyInput, 'ordinal'>[],
): Promise<string[]> {
  const seen = new Map<string, number>();
  const inputs: ImportKeyInput[] = rows.map(row => {
    const hasBalance = typeof row.balanceAfter === 'number' && Number.isFinite(row.balanceAfter);
    if (hasBalance) return { ...row };
    const groupKey = [row.userId, String(row.paymentSource ?? ''), toUtcDateKey(row.date), String(row.type ?? ''), toAmountKey(row.amount)].join('|');
    const ordinal = seen.get(groupKey) ?? 0;
    seen.set(groupKey, ordinal + 1);
    return { ...row, ordinal };
  });
  return Promise.all(inputs.map(computeImportKey));
}
