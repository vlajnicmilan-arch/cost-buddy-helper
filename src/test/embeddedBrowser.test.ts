import { describe, it, expect } from 'vitest';
import { detectEmbeddedBrowser } from '@/lib/embeddedBrowser';

describe('detectEmbeddedBrowser', () => {
  it('detects Facebook in-app browser (FBAN/FBAV)', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 [FBAN/FB4A;FBAV/420.0.0.32.61;]';
    expect(detectEmbeddedBrowser(ua)).toEqual({ embedded: true, hint: 'facebook' });
  });

  it('detects FB_IAB marker', () => {
    const ua = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 [FB_IAB/FB4A;FBAV/400.0;]';
    expect(detectEmbeddedBrowser(ua)).toEqual({ embedded: true, hint: 'facebook' });
  });

  it('detects Instagram in-app browser', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 250.0.0.0';
    expect(detectEmbeddedBrowser(ua)).toEqual({ embedded: true, hint: 'instagram' });
  });

  it('detects LINE in-app browser', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Line/12.10.0';
    expect(detectEmbeddedBrowser(ua)).toEqual({ embedded: true, hint: 'line' });
  });

  it('detects WeChat (MicroMessenger)', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) MicroMessenger/8.0.20';
    expect(detectEmbeddedBrowser(ua)).toEqual({ embedded: true, hint: 'wechat' });
  });

  it('recognizes a regular browser as not embedded', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36';
    expect(detectEmbeddedBrowser(ua)).toEqual({ embedded: false, hint: 'none' });
  });

  it('returns unknown for empty userAgent', () => {
    expect(detectEmbeddedBrowser('')).toEqual({ embedded: false, hint: 'unknown' });
    expect(detectEmbeddedBrowser(null)).toEqual({ embedded: false, hint: 'unknown' });
  });
});
