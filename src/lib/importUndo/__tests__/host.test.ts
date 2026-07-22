import { describe, it, expect, beforeEach } from 'vitest';
import {
  openImportBatch,
  closeImportBatch,
  subscribeImportUndo,
  _peekImportUndo,
} from '../host';

describe('importUndo/host', () => {
  beforeEach(() => closeImportBatch());

  it('starts empty', () => {
    expect(_peekImportUndo()).toBeNull();
  });

  it('opens with batchId and notifies listeners', () => {
    const seen: (string | null)[] = [];
    const unsub = subscribeImportUndo((r) => seen.push(r?.batchId ?? null));
    openImportBatch('batch-123');
    expect(_peekImportUndo()?.batchId).toBe('batch-123');
    // initial null + open
    expect(seen).toEqual([null, 'batch-123']);
    unsub();
  });

  it('close resets state', () => {
    openImportBatch('b1');
    closeImportBatch();
    expect(_peekImportUndo()).toBeNull();
  });

  it('ignores empty batchId', () => {
    openImportBatch('');
    expect(_peekImportUndo()).toBeNull();
  });

  it('preserves onUndone callback', async () => {
    let called = 0;
    openImportBatch('b1', () => { called += 1; });
    await _peekImportUndo()?.onUndone?.();
    expect(called).toBe(1);
  });
});
