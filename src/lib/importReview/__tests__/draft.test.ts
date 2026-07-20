import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDraft,
  clearPayload,
  hasResumableReview,
  loadDraft,
  loadPayload,
  savePayload,
  saveDraft,
} from '../draft';
import { IMPORT_REVIEW_DRAFT_TTL_MS, type ImportReviewPayload } from '../types';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

const payload: ImportReviewPayload = {
  jobId: 'job-A',
  sourceId: 'src-1',
  sourceName: 'Revolut',
  createdAt: 0, importedTransactions: [], batchId: "test-batch",
  manualCandidates: {},
  rows: [{
    index: 0, date: '2026-07-14', amount: 11, type: 'expense',
    classification: { kind: 'new', existsByFingerprint: false },
  }],
};

const decisions = {
  autoMerge: { 0: true },
  questions: {},
  newRows: { 0: true },
};

describe('importReview/draft', () => {
  let store: MemoryStorage;
  beforeEach(() => { store = new MemoryStorage(); });

  it('roundtrips payload save/load/clear', () => {
    savePayload(payload, store);
    expect(loadPayload(store)?.jobId).toBe('job-A');
    clearPayload(store);
    expect(loadPayload(store)).toBeNull();
  });

  it('roundtrips draft save/load within TTL', () => {
    saveDraft('job-A', decisions, { now: 1_000 }, store);
    const d = loadDraft({ now: 1_500, storage: store });
    expect(d?.jobId).toBe('job-A');
    expect(d?.decisions.autoMerge[0]).toBe(true);
  });

  it('expires draft after TTL and cleans up', () => {
    saveDraft('job-A', decisions, { now: 0 }, store);
    const stale = loadDraft({ now: IMPORT_REVIEW_DRAFT_TTL_MS + 1, storage: store });
    expect(stale).toBeNull();
    // second call still null → underlying entry cleared
    expect(loadDraft({ now: IMPORT_REVIEW_DRAFT_TTL_MS + 2, storage: store })).toBeNull();
  });

  it('jobId mismatch → no draft surfaced (stale from another import)', () => {
    saveDraft('job-A', decisions, { now: 100 }, store);
    expect(loadDraft({ jobId: 'job-B', now: 200, storage: store })).toBeNull();
    // but same job returns draft
    expect(loadDraft({ jobId: 'job-A', now: 200, storage: store })?.jobId).toBe('job-A');
  });

  it('hasResumableReview requires both payload + matching draft', () => {
    expect(hasResumableReview(100, store)).toBe(false);
    saveDraft('job-A', decisions, { now: 100 }, store);
    expect(hasResumableReview(200, store)).toBe(false); // payload missing
    savePayload(payload, store);
    expect(hasResumableReview(200, store)).toBe(true);
    // simulate pause/resume: values persist across "sessions" because storage is same
    // (Capacitor keeps sessionStorage alive across pause/resume of the WebView)
    const decisionsAgain = loadDraft({ jobId: 'job-A', now: 300, storage: store });
    expect(decisionsAgain?.decisions.autoMerge[0]).toBe(true);
    clearDraft(store);
    expect(hasResumableReview(400, store)).toBe(false);
  });

  it('simulated pause/resume preserves decisions', () => {
    // user makes decisions, then app is paused
    saveDraft('job-A', { ...decisions, autoMerge: { 0: false } }, { now: 100 }, store);
    savePayload(payload, store);
    // resume — new "component mount"
    const restored = loadDraft({ jobId: 'job-A', now: 100 + 5 * 60_000, storage: store });
    expect(restored?.decisions.autoMerge[0]).toBe(false);
    expect(loadPayload(store)?.rows.length).toBe(1);
  });
});
