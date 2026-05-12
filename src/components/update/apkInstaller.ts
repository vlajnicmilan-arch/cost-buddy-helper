/**
 * APK Installer (native Android only)
 *
 * Strategija (v3 — plugin-independent):
 *   Stari pristup je ovisio isključivo o `@capacitor/browser` pluginu, koji
 *   se na nekim starijim APK buildovima nikad nije ni registrirao u
 *   BridgeActivity (telemetrija: `"Browser" plugin is not implemented on
 *   android`). Posljedica: korisnik se zauvijek ne može auto-updateati.
 *
 *   Sada pokušavamo redoslijedom strategija koje NE ovise o jednom pluginu:
 *     1. `window.open(apkUrl, '_system')`
 *        — Capacitor WebView prepoznaje '_system' target i prosljeđuje
 *          Androidu kao external intent. Ne treba plugin.
 *     2. Anchor download (`<a href download>` simulirani klik)
 *        — Trigerira Android Download Manager direktno iz WebViewa.
 *     3. `Browser.open()` iz @capacitor/browser
 *        — Postojeća implementacija, samo kao zadnji fallback.
 *
 * Kad jedna strategija uspije, telemetrija loga `update_install_intent_launched`
 * s podatkom `strategy`. Ako sve tri puknu, vraćamo `update_download_failed`
 * s razlozima svake.
 */
import { Browser } from '@capacitor/browser';
import { logUpdateEvent } from '@/lib/updateTelemetry';
import { getIsNativeApp } from './updateUtils';

export interface ApkInstallResult {
  success: boolean;
  errorKey?: string;
  errorDetail?: string;
}

type Strategy = 'window_system' | 'anchor' | 'browser';

const tryWindowSystem = (apkUrl: string): { ok: boolean; error?: string } => {
  try {
    const win = window.open(apkUrl, '_system');
    // window.open vraća null ili Window. U Capacitor WebViewu '_system' target
    // prosljeđuje URL system intentu i tipično vraća null bez bacanja errora.
    // Ne možemo pouzdano detektirati uspjeh, pa pretpostavljamo OK ako nije
    // bačena iznimka.
    void win;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

const tryAnchorDownload = (apkUrl: string): { ok: boolean; error?: string } => {
  try {
    const a = document.createElement('a');
    a.href = apkUrl;
    a.download = '';
    a.target = '_system';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { document.body.removeChild(a); } catch { /* noop */ }
    }, 0);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

const tryBrowserPlugin = async (apkUrl: string): Promise<{ ok: boolean; error?: string }> => {
  try {
    await Browser.open({ url: apkUrl, windowName: '_system' });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

export const downloadAndInstallApk = async (
  apkUrl: string,
  _expectedSha256: string | null,
  _onProgressUpdate?: (pct: number) => void
): Promise<ApkInstallResult> => {
  if (!getIsNativeApp()) {
    return { success: false, errorKey: 'errors.appUpdate.platformUnsupported' };
  }

  logUpdateEvent('update_download_started', { url: apkUrl, strategy: 'multi' });

  const attempts: Array<{ strategy: Strategy; error?: string }> = [];

  // 1) window.open('_system')
  const ws = tryWindowSystem(apkUrl);
  if (ws.ok) {
    logUpdateEvent('update_install_intent_launched', { url: apkUrl, strategy: 'window_system' });
    return { success: true };
  }
  attempts.push({ strategy: 'window_system', error: ws.error });

  // 2) Anchor download
  const an = tryAnchorDownload(apkUrl);
  if (an.ok) {
    logUpdateEvent('update_install_intent_launched', { url: apkUrl, strategy: 'anchor' });
    return { success: true };
  }
  attempts.push({ strategy: 'anchor', error: an.error });

  // 3) Browser plugin (legacy fallback)
  const br = await tryBrowserPlugin(apkUrl);
  if (br.ok) {
    logUpdateEvent('update_install_intent_launched', { url: apkUrl, strategy: 'browser' });
    return { success: true };
  }
  attempts.push({ strategy: 'browser', error: br.error });

  const detail = attempts.map((a) => `${a.strategy}: ${a.error ?? 'unknown'}`).join(' | ');
  logUpdateEvent('update_download_failed', { reason: detail, strategy: 'multi_all_failed' });
  return {
    success: false,
    errorKey: 'errors.appUpdate.downloadFailed',
    errorDetail: detail,
  };
};
