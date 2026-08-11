/**
 * Import Review — sessionStorage draft (save/restore/TTL).
 *
 * Milan constraint: fone poziv usred pregleda ne smije izgubiti odluke.
 * Draft survives Capacitor pause/resume by living in sessionStorage under
 * a versioned key. TTL 30 min ({@link IMPORT_REVIEW_DRAFT_TTL_MS}).
 */

import {
  IMPORT_REVIEW_DRAFT_KEY,
  IMPORT_REVIEW_DRAFT_TTL_MS,
  IMPORT_REVIEW_PAYLOAD_KEY,
  type ImportReviewDecisions,
  type ImportReviewDraft,
  type ImportReviewPayload,
} from './types';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getStorage(override?: StorageLike | null): StorageLike | null {
  if (override) return override;
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function savePayload(
  payload: ImportReviewPayload,
  storage?: StorageLike | null,
): void {
  const s = getStorage(storage);
  if (!s) return;
  try {
    s.setItem(IMPORT_REVIEW_PAYLOAD_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export function loadPayload(storage?: StorageLike | null): ImportReviewPayload | null {
  const s = getStorage(storage);
  if (!s) return null;
  try {
    const raw = s.getItem(IMPORT_REVIEW_PAYLOAD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImportReviewPayload;
    if (!parsed?.jobId || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPayload(storage?: StorageLike | null): void {
  const s = getStorage(storage);
  if (!s) return;
  try { s.removeItem(IMPORT_REVIEW_PAYLOAD_KEY); } catch { /* noop */ }
}

export function saveDraft(
  jobId: string,
  decisions: ImportReviewDecisions,
  extra?: { scrollY?: number; now?: number },
  storage?: StorageLike | null,
): void {
  const s = getStorage(storage);
  if (!s) return;
  const draft: ImportReviewDraft = {
    jobId,
    savedAt: extra?.now ?? Date.now(),
    decisions,
    scrollY: extra?.scrollY,
  };
  try { s.setItem(IMPORT_REVIEW_DRAFT_KEY, JSON.stringify(draft)); } catch { /* noop */ }
}

export interface LoadDraftOptions {
  readonly jobId?: string;
  readonly now?: number;
  readonly storage?: StorageLike | null;
}

export function loadDraft(opts: LoadDraftOptions = {}): ImportReviewDraft | null {
  const s = getStorage(opts.storage);
  if (!s) return null;
  const now = opts.now ?? Date.now();
  try {
    const raw = s.getItem(IMPORT_REVIEW_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImportReviewDraft;
    if (!parsed?.jobId || !parsed.decisions) {
      s.removeItem(IMPORT_REVIEW_DRAFT_KEY);
      return null;
    }
    if (now - parsed.savedAt > IMPORT_REVIEW_DRAFT_TTL_MS) {
      s.removeItem(IMPORT_REVIEW_DRAFT_KEY);
      return null;
    }
    if (opts.jobId && parsed.jobId !== opts.jobId) {
      // Different import in progress — do NOT surface stale draft.
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(storage?: StorageLike | null): void {
  const s = getStorage(storage);
  if (!s) return;
  try { s.removeItem(IMPORT_REVIEW_DRAFT_KEY); } catch { /* noop */ }
}

/**
 * Ponuda "Nastavi pregled uvoza" — true kada valjan (in-TTL) draft postoji
 * i payload je još u sessionStorage. Ne otvara ekran; samo signal banneru.
 */
export function hasResumableReview(now?: number, storage?: StorageLike | null): boolean {
  const draft = loadDraft({ now, storage });
  if (!draft) return false;
  const payload = loadPayload(storage);
  if (!payload) return false;
  return payload.jobId === draft.jobId;
}

/* ------------------------------------------------------------------------ *
 * SALDO-MIG (statementClosingBalance) — preživljava skicu, pad i restart.
 *
 * `statementBalanceHint` živi u memoriji PdfImportContexta i briše se čim
 * uvoz izađe iz faze. Payload ga nosi, ali payload sjedi u sessionStorage —
 * nakon zatvaranja/ubijanja aplikacije nestane, pa nastavak skice ostane bez
 * bankovne istine i dijalog "Poravnaj sa stanjem s izvoda" nikad ne dođe.
 * Zato mig zapisujemo u localStorage vezan uz jobId (TTL 24 h) i pri učitavanju
 * njime dopunimo payload ako ga nema.
 * ------------------------------------------------------------------------ */

export const IMPORT_REVIEW_STATEMENT_HINT_KEY = 'vmb-import-review-statement-hint:v1';
export const IMPORT_REVIEW_STATEMENT_HINT_TTL_MS = 24 * 60 * 60 * 1000;

export interface StoredStatementHint {
  readonly jobId: string;
  readonly savedAt: number;
  readonly closingBalance: number | null;
  readonly statementDate: string | null;
}

function getLocalStorage(override?: StorageLike | null): StorageLike | null {
  if (override) return override;
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveStatementHint(
  hint: StoredStatementHint,
  storage?: StorageLike | null,
): void {
  const s = getLocalStorage(storage);
  if (!s) return;
  if (hint.closingBalance === null || hint.closingBalance === undefined) return;
  try { s.setItem(IMPORT_REVIEW_STATEMENT_HINT_KEY, JSON.stringify(hint)); } catch { /* noop */ }
}

export function loadStatementHint(
  jobId: string,
  opts: { now?: number; storage?: StorageLike | null } = {},
): StoredStatementHint | null {
  const s = getLocalStorage(opts.storage);
  if (!s) return null;
  const now = opts.now ?? Date.now();
  try {
    const raw = s.getItem(IMPORT_REVIEW_STATEMENT_HINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredStatementHint;
    if (!parsed?.jobId || parsed.jobId !== jobId) return null;
    if (typeof parsed.closingBalance !== 'number') return null;
    if (now - (parsed.savedAt ?? 0) > IMPORT_REVIEW_STATEMENT_HINT_TTL_MS) {
      s.removeItem(IMPORT_REVIEW_STATEMENT_HINT_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearStatementHint(storage?: StorageLike | null): void {
  const s = getLocalStorage(storage);
  if (!s) return;
  try { s.removeItem(IMPORT_REVIEW_STATEMENT_HINT_KEY); } catch { /* noop */ }
}

/**
 * Dopuni payload spremljenim migom kad ga payload nema (nastavak skice nakon
 * pada). Payload koji već nosi saldo NIKAD se ne pregazi.
 */
export function hydrateStatementHint(
  payload: ImportReviewPayload,
  opts: { now?: number; storage?: StorageLike | null } = {},
): ImportReviewPayload {
  if (typeof payload.statementClosingBalance === 'number') return payload;
  const hint = loadStatementHint(payload.jobId, opts);
  if (!hint) return payload;
  return {
    ...payload,
    statementClosingBalance: hint.closingBalance,
    statementDate: payload.statementDate ?? hint.statementDate,
  };
}
