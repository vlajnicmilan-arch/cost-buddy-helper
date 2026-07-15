import { describe, it, expect } from 'vitest';
import {
  MAX_ATTACHMENTS_PER_STEP,
  MAX_DOC_BYTES,
  canAddMore,
  isDocAttachment,
  isImageAttachment,
  stepActionAllowsAttachments,
  validateDecisionAttachment,
} from '../decisionAttachments';

describe('decisionAttachments — client mirror of server rules', () => {
  it('max 3 attachments per step (constant)', () => {
    expect(MAX_ATTACHMENTS_PER_STEP).toBe(3);
  });

  it('doc size limit is 5 MB', () => {
    expect(MAX_DOC_BYTES).toBe(5 * 1024 * 1024);
  });

  it('canAddMore respects the 3-per-step cap', () => {
    expect(canAddMore(0, 3)).toBe(true);
    expect(canAddMore(1, 2)).toBe(true);
    expect(canAddMore(1, 3)).toBe(false);
    expect(canAddMore(3, 1)).toBe(false);
  });

  it('accept/reject actions may not carry attachments (mirrors server enforce)', () => {
    expect(stepActionAllowsAttachments('propose')).toBe(true);
    expect(stepActionAllowsAttachments('counter')).toBe(true);
    expect(stepActionAllowsAttachments('correction')).toBe(true);
    expect(stepActionAllowsAttachments('accept')).toBe(false);
    expect(stepActionAllowsAttachments('reject')).toBe(false);
  });

  describe('validateDecisionAttachment', () => {
    it('accepts common image mimes', () => {
      for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic']) {
        expect(validateDecisionAttachment({ type, name: 'a', size: 100 })).toEqual({ ok: true });
      }
      expect(isImageAttachment({ type: 'image/jpeg' })).toBe(true);
    });

    it('accepts PDF/DOCX under 5 MB', () => {
      expect(validateDecisionAttachment({ type: 'application/pdf', name: 'x.pdf', size: 1024 })).toEqual({ ok: true });
      expect(validateDecisionAttachment({
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        name: 'x.docx',
        size: 1024,
      })).toEqual({ ok: true });
      expect(isDocAttachment({ type: 'application/pdf' })).toBe(true);
    });

    it('rejects docs above 5 MB', () => {
      const res = validateDecisionAttachment({ type: 'application/pdf', name: 'big.pdf', size: MAX_DOC_BYTES + 1 });
      expect(res).toEqual({ ok: false, reason: 'docTooLarge' });
    });

    it('rejects unsupported types (exe, video, …)', () => {
      const res = validateDecisionAttachment({ type: 'application/x-msdownload', name: 'evil.exe', size: 100 });
      expect(res).toEqual({ ok: false, reason: 'unsupportedType' });
      expect(validateDecisionAttachment({ type: 'video/mp4', name: 'v.mp4', size: 100 }).ok).toBe(false);
    });
  });
});
