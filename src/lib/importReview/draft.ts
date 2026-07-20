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
