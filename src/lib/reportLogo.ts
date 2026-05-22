// Shared logo asset loader for PDF + HTML reports.
// Loads the V&M Balance logo (PNG) once, converts to data URL, caches it.
import logoUrl from '@/assets/vm-balance-logo.png';

let cached: string | null = null;
let pending: Promise<string | null> | null = null;

const fetchAsDataUrl = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('[reportLogo] failed to load', e);
    return null;
  }
};

export const ensureReportLogo = async (): Promise<string | null> => {
  if (cached) return cached;
  if (!pending) {
    pending = fetchAsDataUrl(logoUrl).then((d) => {
      cached = d;
      return d;
    });
  }
  return pending;
};

export const getReportLogoDataUrl = (): string | null => cached;
