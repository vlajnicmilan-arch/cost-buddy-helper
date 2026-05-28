import { describe, it, expect } from 'vitest';
import { shouldWarnMissingItems } from '../receiptItemsGuard';

describe('shouldWarnMissingItems', () => {
  it('returns false for non-AI scans without items (manual entry)', () => {
    expect(shouldWarnMissingItems({ aiExtracted: false, items: undefined })).toBe(false);
    expect(shouldWarnMissingItems({ aiExtracted: false, items: [] })).toBe(false);
    expect(shouldWarnMissingItems({ aiExtracted: null, items: undefined })).toBe(false);
  });

  it('returns false for AI scan WITH items (happy path)', () => {
    expect(shouldWarnMissingItems({ aiExtracted: true, items: [{ name: 'x' }] })).toBe(false);
    expect(shouldWarnMissingItems({ aiExtracted: true, items: [{}, {}] })).toBe(false);
  });

  it('returns true for AI scan WITHOUT items (regression of write-path bug)', () => {
    expect(shouldWarnMissingItems({ aiExtracted: true, items: undefined })).toBe(true);
    expect(shouldWarnMissingItems({ aiExtracted: true, items: null })).toBe(true);
    expect(shouldWarnMissingItems({ aiExtracted: true, items: [] })).toBe(true);
  });
});
