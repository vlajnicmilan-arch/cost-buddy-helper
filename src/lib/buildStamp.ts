/**
 * "Otisak objave" — which published bundle the user is actually running.
 *
 * Diagnostics rows are useless when we cannot tell which deploy produced them,
 * so every failure carries the hashed entry asset name (assets/index-XXXX.js)
 * alongside the app version.
 */
import { APP_VERSION } from '@/lib/version';

let cached: string | null = null;

export const getBuildStamp = (): string => {
  if (cached) return cached;
  let asset = 'unknown';
  try {
    const el = document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]');
    const src = el?.getAttribute('src') ?? '';
    const match = src.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
    if (match) asset = match[0];
  } catch {
    /* non-browser environment — the version alone still identifies the build */
  }
  cached = `${APP_VERSION}|${asset}`;
  return cached;
};
