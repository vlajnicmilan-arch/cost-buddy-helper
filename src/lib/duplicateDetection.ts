/**
 * Centralized duplicate detection for transactions.
 *
 * Used by:
 * - useExpenses.findDuplicates  → CSV/PDF bulk import (ignoreSameDayDuplicateGuard: true)
 * - useExpenses.checkDuplicate  → manual entry / receipt scan (ignoreSameDayDuplicateGuard: false)
 *
 * Pure module — no React, no Supabase. Fully unit-testable.
 *
 * Levels:
 *   strict     90–100  Auto-skip / hard block (manual entry double-click guard)
 *   fuzzy      60–89   Review dialog ("Slično postoji, dodati svejedno?")
 *   suspicious 30–59   Soft hint only (badge in Phase B); treated as unique today
 *   unique     0–29    No conflict
 */

import { isSamePaymentSource } from './paymentSource/resolve';

import type { Expense } from '@/types/expense';

export type DuplicateLevel = 'strict' | 'fuzzy' | 'suspicious' | 'unique';

export interface NewTxInput {
  amount: number;
  type: string;
  date: Date;
  description: string;
  merchant_name?: string | null;
  payment_source?: string | null;
}

export interface DuplicateMatch {
  level: DuplicateLevel;
  match: Expense | null;
  confidence: number;
  /** i18n key under `duplicates.reason.*` */
  reason: string;
}

export interface DetectOptions {
  /**
   * When `true` (CSV/PDF bulk import), two identical purchases on the same day
   * are NOT auto-skipped — they downgrade to `suspicious` so the importer keeps
   * them and the user can review. When `false` (manual entry), they remain
   * `strict` to prevent accidental double-click submissions.
   */
  ignoreSameDayDuplicateGuard?: boolean;
}

const DAY_MS = 86400000;

// ─────────────────────────────────────────────────────────────────────────────
// String helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Geo / country tokens commonly found in HR POS transaction descriptions.
 * Stripping them prevents false-positives where two unrelated merchants share
 * a city name (e.g. "LUKOIL POLJUD/SPLIT/HRV" vs "LESNINA H PC SPLIT").
 */
const GEO_STOPWORDS = new Set([
  'split','zagreb','rijeka','osijek','zadar','pula','sibenik','dubrovnik',
  'varazdin','karlovac','vinkovci','sisak','slavonski','brod','bjelovar',
  'kastel','supetar','trogir','makarska','samobor','koprivnica','krapina',
  'cakovec','gospic','velika','gorica','hrv','hrvatska','hr','eur','eu',
]);

export function normalizeMerchant(name: string): string {
  if (!name) return '';
  const cleaned = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/\b(d\.?o\.?o\.?|d\.?d\.?|j\.?d\.?o\.?o\.?|obrt|trgovina|trgovački|poslovanje|hotel)\b/gi, '')
    .replace(/\b\d{2,}\b/g, ' ') // drop store numbers
    .replace(/[.,&\-_'"()/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const filtered = cleaned
    .split(/\s+/)
    .filter(w => !GEO_STOPWORDS.has(w))
    .join(' ')
    .trim();
  return filtered;
}

export function areMerchantsSimilar(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const na = normalizeMerchant(a);
  const nb = normalizeMerchant(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length < 2 || nb.length < 2) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = na.split(/\s+/).filter(w => w.length >= 3);
  const wb = nb.split(/\s+/).filter(w => w.length >= 3);
  if (wa.length === 0 || wb.length === 0) return false;
  const common = wa.filter(w => wb.some(w2 => w2.includes(w) || w.includes(w2)));
  const minLen = Math.min(wa.length, wb.length);
  // Require either ≥2 common meaningful words OR ≥60% overlap on a multi-word name.
  // Single shared word on multi-word merchants is too weak (typical false-positive).
  if (common.length >= 2) return true;
  return minLen >= 2 && common.length / minLen >= 0.6;
}

/**
 * Cross-field merchant similarity: covers the common case where the bank
 * statement row has rich `merchant_name` but the manual entry only has a short
 * `description` (e.g. "kava" vs "CAFFE BAR ABC 1234 ZAGREB"). Tries all
 * meaningful combinations through `areMerchantsSimilar`.
 */
export function merchantOrDescriptionSimilar(
  aMerchant?: string | null,
  aDescription?: string | null,
  bMerchant?: string | null,
  bDescription?: string | null,
): boolean {
  if (areMerchantsSimilar(aMerchant, bMerchant)) return true;
  if (areMerchantsSimilar(aMerchant, bDescription)) return true;
  if (areMerchantsSimilar(aDescription, bMerchant)) return true;
  return false;
}

export function descriptionsOverlap(a?: string | null, b?: string | null): boolean {
  const da = (a || '').toLowerCase().trim();
  const db = (b || '').toLowerCase().trim();
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.includes(db) || db.includes(da)) return true;
  const wa = da.split(/\s+/).filter(w => w.length >= 3);
  const wb = db.split(/\s+/).filter(w => w.length >= 3);
  if (wa.length === 0 || wb.length === 0) return false;
  const common = wa.filter(w => wb.some(w2 => w2.includes(w) || w.includes(w2)));
  const minLen = Math.min(wa.length, wb.length);
  return common.length / minLen >= 0.6;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let curr = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(curr + 1, prev[j] + 1, prev[j - 1] + cost);
      prev[j - 1] = curr;
      curr = next;
    }
    prev[b.length] = curr;
  }
  return prev[b.length];
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function dayDiff(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / DAY_MS;
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isWithinSameWeek(a: Date, b: Date): boolean {
  return dayDiff(a, b) <= 7;
}

/**
 * Auto-generated recurring transactions are recognised via note suffixes
 * written by the generator. Kept lenient so locale changes don't break it.
 */
export function isAutoGenerated(e: Expense): boolean {
  const note = (e.note || '').toLowerCase();
  return note.includes('ponavljajuća') || note.includes('(auto)') || note.includes('automatski') || note.includes('auto-generated');
}

// ─────────────────────────────────────────────────────────────────────────────
// Core scorer
// ─────────────────────────────────────────────────────────────────────────────

interface RawScore {
  confidence: number;
  level: DuplicateLevel;
  reason: string;
}

function scorePair(
  tx: NewTxInput,
  existing: Expense,
  options: DetectOptions
): RawScore {
  if (existing.type !== tx.type) {
    return { confidence: 0, level: 'unique', reason: 'duplicates.reason.differentType' };
  }

  const txDate = toDate(tx.date);
  const exDate = toDate(existing.date);
  const days = dayDiff(exDate, txDate);
  const exAmt = Number(existing.amount);
  const txAmt = Number(tx.amount);
  const amtDelta = Math.abs(exAmt - txAmt);
  const exactAmount = amtDelta < 0.01;
  const within1pct = amtDelta / Math.max(Math.abs(txAmt), 0.01) <= 0.01;

  const merchantMatch = merchantOrDescriptionSimilar(
    existing.merchant_name,
    existing.description,
    tx.merchant_name,
    tx.description,
  );
  const descMatch = descriptionsOverlap(existing.description, tx.description);
  const samePaymentSource =
    !!existing.payment_source && !!tx.payment_source && isSamePaymentSource(existing.payment_source, tx.payment_source);


  // ── STRICT (90–100) ──────────────────────────────────────────────────────
  // Exact amount + date ±1 day + (merchant OR very similar description)
  // + same payment source (when both sides have it).
  if (exactAmount && days <= 1 && (merchantMatch || descMatch)) {
    const sameDay = sameCalendarDay(exDate, txDate);
    const sameDayCollision = sameDay && merchantMatch;

    // CSV/PDF: two identical txs on the same day → downgrade to suspicious.
    // Manual entry keeps strict (double-click guard).
    if (sameDayCollision && options.ignoreSameDayDuplicateGuard) {
      return {
        confidence: 55,
        level: 'suspicious',
        reason: 'duplicates.reason.sameAmountSameDay',
      };
    }

    let confidence = 92;
    if (samePaymentSource) confidence = 98;
    else if (existing.payment_source && tx.payment_source) confidence = 88; // different source → drop to fuzzy band
    if (confidence < 90) {
      return { confidence, level: 'fuzzy', reason: 'duplicates.reason.exactAmountDifferentSource' };
    }
    return { confidence, level: 'strict', reason: 'duplicates.reason.exactAmountSameDayMerchant' };
  }

  // ── FUZZY (60–89) ────────────────────────────────────────────────────────
  // Exact amount + date ±3 days + (merchant OR description match)
  if (exactAmount && days <= 3 && (merchantMatch || descMatch)) {
    const confidence = Math.round(85 - days * 5); // 85 → 70 over 3 days
    return {
      confidence,
      level: 'fuzzy',
      reason: 'duplicates.reason.sameAmountNearDate',
    };
  }

  // ── SUSPICIOUS (30–59) ───────────────────────────────────────────────────
  // Tight thresholds to avoid false-positives: amount within ±1%, date ±2 days,
  // and merchant must be genuinely similar (not just shared geo word — handled
  // upstream by GEO_STOPWORDS strip in normalizeMerchant).
  if (
    within1pct &&
    days <= 2 &&
    (merchantMatch ||
      descMatch ||
      (existing.merchant_name &&
        tx.merchant_name &&
        levenshtein(
          normalizeMerchant(existing.merchant_name),
          normalizeMerchant(tx.merchant_name)
        ) < 3))
  ) {
    const confidence = 45 - Math.round(days);
    return {
      confidence: Math.max(30, confidence),
      level: 'suspicious',
      reason: 'duplicates.reason.similarAmountSameWeek',
    };
  }

  return { confidence: 0, level: 'unique', reason: 'duplicates.reason.noMatch' };
}

/**
 * Returns the strongest match against `existing[]`.
 * If the strongest match is an auto-generated recurring expense the caller
 * (findDuplicates wrapper) decides whether to offer "replace auto with real".
 */
export function detectDuplicate(
  tx: NewTxInput,
  existing: Expense[],
  options: DetectOptions = {}
): DuplicateMatch {
  let best: { score: RawScore; match: Expense } | null = null;

  for (const candidate of existing) {
    const score = scorePair(tx, candidate, options);
    if (score.level === 'unique') continue;
    if (!best || score.confidence > best.score.confidence) {
      best = { score, match: candidate };
    }
  }

  if (!best) {
    return { level: 'unique', match: null, confidence: 0, reason: 'duplicates.reason.noMatch' };
  }
  return {
    level: best.score.level,
    match: best.match,
    confidence: best.score.confidence,
    reason: best.score.reason,
  };
}
