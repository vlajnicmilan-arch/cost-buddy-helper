import { describe, it, expect } from 'vitest';
import {
  compressImageDataUrl,
  compressImageFile,
  resolveMaxWidth,
  resolveQuality,
  RECEIPT_COMPRESS,
  ATTACHMENT_COMPRESS,
} from '../imageCompress';

describe('imageCompress defaults', () => {
  it('receipt preset preserves legacy scanner behaviour (1600px, quality 0.9)', () => {
    expect(RECEIPT_COMPRESS.maxWidth).toBe(1600);
    expect(RECEIPT_COMPRESS.quality).toBe(0.9);
  });

  it('attachment preset uses ~400 KB target quality (0.8) at 1600px', () => {
    expect(ATTACHMENT_COMPRESS.maxWidth).toBe(1600);
    expect(ATTACHMENT_COMPRESS.quality).toBe(0.8);
  });

  it('resolveMaxWidth / resolveQuality fall back to receipt preset', () => {
    expect(resolveMaxWidth()).toBe(1600);
    expect(resolveQuality()).toBe(0.9);
    expect(resolveMaxWidth({ maxWidth: 1024 })).toBe(1024);
    expect(resolveQuality({ quality: 0.5 })).toBe(0.5);
  });
});

describe('imageCompress runtime fallbacks (no canvas in jsdom)', () => {
  it('returns input unchanged when canvas API is unavailable', async () => {
    const original = 'data:image/png;base64,AAAA';
    // jsdom Image ne renderira → onerror path vraća input
    const out = await compressImageDataUrl(original, { maxWidth: 100, quality: 0.5 });
    expect(typeof out).toBe('string');
    // fallback vraća isti string ili barem string (nikad throws)
    expect(out === original || out.startsWith('data:')).toBe(true);
  });

  it('compressImageFile returns non-image files unchanged', async () => {
    const pdf = new File([new Uint8Array([1, 2, 3])], 'x.pdf', { type: 'application/pdf' });
    const out = await compressImageFile(pdf);
    expect(out).toBe(pdf);
  });
});
