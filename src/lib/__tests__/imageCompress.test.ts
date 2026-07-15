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

describe('imageCompress runtime fallbacks', () => {
  it('falls back to original when the browser Image loader errors', async () => {
    const original = 'data:image/png;base64,AAAA';
    // Stub Image so onerror fires deterministically (jsdom never fires load/error
    // za nevažeći base64; ovo simulira taj fallback path bez ovisnosti o okolini).
    const RealImage = globalThis.Image;
    class StubImg {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    // @ts-expect-error test stub
    globalThis.Image = StubImg;
    try {
      const out = await compressImageDataUrl(original, { maxWidth: 100, quality: 0.5 });
      expect(out).toBe(original);
    } finally {
      globalThis.Image = RealImage;
    }
  });

  it('compressImageFile returns non-image files unchanged', async () => {
    const pdf = new File([new Uint8Array([1, 2, 3])], 'x.pdf', { type: 'application/pdf' });
    const out = await compressImageFile(pdf);
    expect(out).toBe(pdf);
  });
});
